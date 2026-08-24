import * as path from "node:path";
import type { EnvConfig } from "./config.js";

/**
 * Env-file carry (spec §3, D4 tier 3 with the defaults flipped) — the pure half.
 *
 * The whole declared env file travels by default. Values never reach the
 * terminal, the manifest, or a log — they exist only inside the carried copy in
 * the capture dir, and land mode 600 on the runner. Nothing here reads or
 * writes files; the picker and the copying live in the CLI.
 */

const ASSIGN_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

/**
 * One canonical spelling for an env-file path.
 *
 * The same file reaches us under several names — compose writes
 * `./apps/web/.env`, `git ls-files` writes `apps/web/.env`, a hand-written
 * .stepaway.json might write `apps//web/.env` or an absolute path. Left alone
 * they show up as separate entries in the picker and get carried twice.
 *
 * Returns a root-relative, forward-slash path, or null if the path escapes the
 * project root (which we refuse to carry).
 */
export function normalizeEnvPath(root: string, p: string): string | null {
  const raw = String(p ?? "").trim();
  if (!raw) return null;
  const rel = path.relative(root, path.resolve(root, raw));
  if (!rel || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join("/");
}

/** Normalize a list of env-file paths and drop duplicates, keeping first order. */
export function normalizeEnvPaths(root: string, list: string[]): string[] {
  const out: string[] = [];
  for (const p of list ?? []) {
    const n = normalizeEnvPath(root, p);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Same normalization applied to a remembered .stepaway.json `env` block. */
export function normalizeEnvConfig(root: string, cfg: EnvConfig | null): EnvConfig | null {
  if (!cfg) return null;
  return { ...cfg, carryFiles: normalizeEnvPaths(root, cfg.carryFiles) };
}

/** Variable names assigned in a dotenv-style file body. */
export function parseVarNames(content: string): string[] {
  const names: string[] = [];
  for (const raw of content.split("\n")) {
    if (/^\s*#/.test(raw)) continue;
    const m = ASSIGN_RE.exec(raw);
    if (m && !names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

/**
 * Apply excludeVars (line dropped) and overrideVars (line rewritten, appended
 * if absent) to a dotenv file body.
 */
export function filterEnvFile(
  content: string,
  excludeVars: string[],
  overrideVars: Record<string, string>,
  opts: { appendMissing?: boolean } = {},
): { text: string; kept: string[]; dropped: string[] } {
  const drop = new Set(excludeVars);
  const over = new Map(Object.entries(overrideVars));
  const kept: string[] = [];
  const dropped: string[] = [];
  const seenOverride = new Set<string>();
  const out: string[] = [];
  const lines = content.split("\n");
  const trailingNL = lines.length > 0 && lines[lines.length - 1] === "";
  if (trailingNL) lines.pop();
  for (const line of lines) {
    const m = /^\s*#/.test(line) ? null : ASSIGN_RE.exec(line);
    if (!m) {
      out.push(line);
      continue;
    }
    const name = m[1];
    if (drop.has(name)) {
      dropped.push(name);
      continue;
    }
    if (over.has(name)) {
      out.push(`${name}=${over.get(name)}`);
      seenOverride.add(name);
      if (!kept.includes(name)) kept.push(name);
      continue;
    }
    out.push(line);
    if (!kept.includes(name)) kept.push(name);
  }
  if (opts.appendMissing) {
    for (const [k, v] of over) {
      if (seenOverride.has(k) || drop.has(k)) continue;
      out.push(`${k}=${v}`);
      if (!kept.includes(k)) kept.push(k);
    }
  }
  return { text: out.length ? out.join("\n") + "\n" : "", kept, dropped };
}

/**
 * Hard-fail preflight (D4): every required var name must be satisfied by a
 * carried file, an override, or the runner's own environment. Blocking by
 * design — there is no --force, because defaulting to blank is the worst
 * possible handoff outcome.
 */
export function unsatisfiedVars(required: string[], satisfied: Set<string>, runnerEnv: Set<string>): string[] {
  return required.filter((v) => !satisfied.has(v) && !runnerEnv.has(v));
}
