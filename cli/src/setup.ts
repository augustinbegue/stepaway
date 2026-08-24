import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Setup-command detection (spec §3). A table, not a chain of ifs, so other
 * stacks slot in without touching the caller. First match wins.
 *
 * Detection runs on the LAPTOP against the same repo that is about to travel:
 * the lockfiles are identical on both ends, and doing it here means the consent
 * screen can name the command before anything moves.
 */
export type SetupRule = { marker: string; command: string };

export const SETUP_TABLE: SetupRule[] = [
  { marker: "bun.lock", command: "bun install" },
  { marker: "bun.lockb", command: "bun install" },
  { marker: "pnpm-lock.yaml", command: "pnpm i" },
  { marker: "yarn.lock", command: "yarn" },
  { marker: "package-lock.json", command: "npm ci" },
];

export function detectSetup(dir: string): string | null {
  for (const r of SETUP_TABLE) {
    if (fs.existsSync(path.join(dir, r.marker))) return r.command;
  }
  return null;
}

/** Configured command wins; `""` or explicit null in config means "skip". */
export function resolveSetup(dir: string, configured: string | null): string | null {
  if (typeof configured === "string") return configured.trim() || null;
  return detectSetup(dir);
}
