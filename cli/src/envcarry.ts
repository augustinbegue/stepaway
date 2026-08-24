import * as fs from "node:fs";
import * as path from "node:path";
import {
  filterEnvFile,
  normalizeEnvConfig,
  normalizeEnvPaths,
  parseVarNames,
  type CarriedEnvFile,
  type EnvConfig,
} from "@stepaway/core";
import { isTTY } from "./sh.js";
import type { Ui } from "./ui.js";

/**
 * Env-file carry (spec §3, D4 tier 3 with the defaults flipped) — the local
 * half: the picker, and copying the chosen files into the capture dir. The
 * pure parts (path normalization, dotenv parsing/filtering, the unsatisfied-var
 * preflight) live in @stepaway/core.
 *
 * The whole declared env file travels by default. Values never reach the
 * terminal, the manifest, or a log — they exist only inside the carried copy in
 * the capture dir, and land mode 600 on the runner.
 */

export type EnvCarryResult = {
  carried: CarriedEnvFile[];
  /** every var name the runner will actually have from files + overrides. */
  satisfied: Set<string>;
  dropped: string[];
  skipped: string[];
};

/**
 * Copy the chosen env files into <captureDir>/envfiles/<relative path>,
 * filtered. Returns names and counts only.
 */
export function carryEnvFiles(
  root: string,
  captureDir: string,
  declared: string[],
  plan: EnvConfig,
): EnvCarryResult {
  const outBase = path.join(captureDir, "envfiles");
  const carried: CarriedEnvFile[] = [];
  const satisfied = new Set<string>(Object.keys(plan.overrideVars));
  const dropped: string[] = [];
  // normalize + dedupe: the same file must never be carried twice
  const carryList = normalizeEnvPaths(root, plan.carryFiles);
  const chosen = new Set(carryList);
  const skipped = normalizeEnvPaths(root, declared).filter((d) => !chosen.has(d));

  // overrides that no carried file declares are appended once, to the first
  // carried file (or to a fresh .env when nothing else is carried)
  let first = true;
  for (const rel of carryList) {
    const src = path.join(root, rel);
    if (!fs.existsSync(src)) continue;
    const filtered = filterEnvFile(fs.readFileSync(src, "utf8"), plan.excludeVars, plan.overrideVars, {
      appendMissing: first,
    });
    first = false;
    const dst = path.join(outBase, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, filtered.text, { mode: 0o600 });
    for (const k of filtered.kept) satisfied.add(k);
    for (const d of filtered.dropped) if (!dropped.includes(d)) dropped.push(d);
    carried.push({ path: rel, vars: filtered.kept.length });
  }
  const leftover = Object.entries(plan.overrideVars).filter(([k]) => !plan.excludeVars.includes(k));
  if (first && leftover.length) {
    const dst = path.join(outBase, ".env");
    fs.mkdirSync(outBase, { recursive: true });
    fs.writeFileSync(dst, leftover.map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });
    carried.push({ path: ".env", vars: leftover.length });
  }
  if (carried.length) {
    fs.mkdirSync(path.join(captureDir, "meta"), { recursive: true });
    fs.writeFileSync(
      path.join(captureDir, "meta", "env-carried.txt"),
      carried.map((c) => `${c.path}\t${c.vars}`).join("\n") + "\n",
    );
  }
  return { carried, satisfied, dropped, skipped };
}

/** Count assignments in a file without ever surfacing a value. */
function varCount(root: string, rel: string): number {
  try {
    return parseVarNames(fs.readFileSync(path.join(root, rel), "utf8")).length;
  } catch {
    return 0;
  }
}

/**
 * Interactive picker, used only on a TTY when .stepaway.json has no remembered
 * `env` block: a multiselect over the declared files (all pre-checked) plus a
 * free-text list of variable names to leave behind. Values are never displayed.
 */
export async function pickEnvFiles(
  ui: Ui,
  root: string,
  declared: string[],
): Promise<{ carryFiles: string[]; excludeVars: string[] }> {
  if (!declared.length) return { carryFiles: [], excludeVars: [] };
  const options = declared.map((f) => {
    const n = varCount(root, f);
    return { value: f, label: f, hint: `${n} var${n === 1 ? "" : "s"}` };
  });
  const carryFiles = await ui.multiselect(
    "env files to carry (values travel encrypted in the capture, never printed)",
    options,
    declared,
  );
  let excludeVars: string[] = [];
  if (carryFiles.length) {
    const v = await ui.text("variable names to leave behind (comma-separated, Enter for none)", "none");
    excludeVars = v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return { carryFiles, excludeVars };
}

/**
 * Decide the plan: remembered config wins; otherwise ask on a TTY; otherwise
 * (skill / --yes / no TTY) carry everything declared.
 *
 * Every path in play — declared and remembered alike — is normalized first, so
 * `./apps/web/.env` and `apps/web/.env` are one entry, not two.
 */
export async function resolveEnvPlan(
  declared: string[],
  remembered: EnvConfig | null,
  opts: { interactive: boolean; ui?: Ui; root: string },
): Promise<{ plan: EnvConfig; asked: boolean; declared: string[] }> {
  const root = opts.root;
  const list = normalizeEnvPaths(root, declared);
  const mem = normalizeEnvConfig(root, remembered);
  if (mem) {
    return {
      plan: {
        carryFiles: mem.carryFiles.filter((f) => list.includes(f)),
        excludeVars: mem.excludeVars,
        overrideVars: mem.overrideVars,
      },
      asked: false,
      declared: list,
    };
  }
  const ui = opts.ui;
  if (opts.interactive && ui?.fancy && isTTY() && list.length) {
    const picked = await pickEnvFiles(ui, root, list);
    return { plan: { ...picked, overrideVars: {} }, asked: true, declared: list };
  }
  return { plan: { carryFiles: [...list], excludeVars: [], overrideVars: {} }, asked: false, declared: list };
}
