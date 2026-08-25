import * as path from "node:path";

/**
 * `.stepaway.json` — the project-scoped config shape, its defaults, and the
 * pure derivations both the CLI and the backend need. Reading and writing the
 * file is the CLI's job (packages/core never touches a filesystem).
 */

/**
 * Paths (from `git ls-files`, i.e. repo-relative, '/' separated) whose prefix
 * matches one of these never travel: agent worktrees are throwaway checkouts of
 * the same repo and would otherwise multiply the payload.
 */
export const DEFAULT_EXCLUDES = [".claude/worktrees/", ".codex/worktrees/"];

export type EnvConfig = {
  /** repo-relative env files to carry whole. */
  carryFiles: string[];
  /** variable names stripped from the carried copies. */
  excludeVars: string[];
  /** variable names rewritten in the carried copies (values stay local-only). */
  overrideVars: Record<string, string>;
};

export type StepawayConfig = {
  /** optional per-project backend override (SPEC-v0.2 §4); global config is the default. */
  server?: string | null;
  remotePathBase: string;
  /** repo-relative compose file; null = autodetect at the repo root. */
  composeFile: string | null;
  /** extra path prefixes excluded from the dirty capture and env scan. */
  excludeGlobs: string[];
  /** command run in the restored working tree before launch; null = autodetect. */
  setup: string | null;
  /** remembered env-carry decisions; null = never asked. */
  env: EnvConfig | null;
};

export const CONFIG_FILE = ".stepaway.json";

export const DEFAULT_CONFIG: StepawayConfig = {
  remotePathBase: "/work",
  composeFile: null,
  excludeGlobs: [],
  setup: null,
  env: null,
};

/** All path prefixes excluded from capture and env scanning. */
export function excludePrefixes(cfg: StepawayConfig): string[] {
  return [...DEFAULT_EXCLUDES, ...cfg.excludeGlobs].map((s) => s.replace(/^\.\//, "")).filter(Boolean);
}

export function isExcluded(relPath: string, prefixes: string[]): boolean {
  const p = relPath.replace(/^\.\//, "");
  return prefixes.some((pre) => p === pre.replace(/\/$/, "") || p.startsWith(pre));
}

/** Working tree on the runner: emptyDir, dies with the pod (by design). */
export function remoteProjectPath(cfg: StepawayConfig, localRoot: string): string {
  return `${cfg.remotePathBase.replace(/\/+$/, "")}/${path.basename(localRoot)}`;
}

/** Git dir on the runner: the PVC, the only durable thing in the pod. */
export function remoteGitDir(localRoot: string): string {
  return `/repo/${path.basename(localRoot)}.git`;
}
