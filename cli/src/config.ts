import * as fs from "node:fs";
import * as path from "node:path";
import { CONFIG_FILE, DEFAULT_CONFIG, type StepawayConfig } from "@stepaway/core";
import { run } from "./sh.js";
import { Client } from "./client.js";
import { NOT_CONFIGURED, readClientConfig, resolveClient } from "./clientconfig.js";

/**
 * `.stepaway.json` and the baton file on disk. The config *shape*, its
 * defaults, DEFAULT_EXCLUDES and the pure derivations (excludePrefixes,
 * isExcluded, remoteProjectPath, remoteGitDir) live in @stepaway/core; this
 * module is only the file I/O around them.
 *
 * v0.2 note: the project config no longer carries namespace/pod/context — the
 * CLI addresses a *backend*, not a cluster. The only cluster-ish key left is an
 * optional per-project `server` override.
 */

/** Project config plus the v0.2 per-project backend override. */
export type ProjectConfig = StepawayConfig & { server: string | null };

/**
 * `.git/stepaway-baton.json`: which *backend session* currently holds this
 * project. v0.2 shape — `{server, id}` replaces `{context, namespace, pod}`.
 */
export type Baton = {
  pushedAt: string;
  /** backend base URL the session lives on. */
  server: string;
  /** API session id (the claude session id, or a uuid when there was no transcript). */
  id: string;
  /** claude transcript id actually carried, if any. */
  sessionId: string | null;
  remotePath: string;
};

/** Nearest enclosing git repo root, else the dir itself. */
export function projectRoot(dir: string): string {
  const abs = path.resolve(dir);
  const r = run("git", ["rev-parse", "--show-toplevel"], { cwd: abs });
  if (r.code === 0 && r.stdout.trim()) return r.stdout.trim();
  return abs;
}

export function configPath(root: string): string {
  return path.join(root, CONFIG_FILE);
}

/** The file as written by the user, untouched. Used so writes never drop keys. */
export function loadRawConfig(root: string): Record<string, any> {
  const p = configPath(root);
  if (!fs.existsSync(p)) return {};
  try {
    const o = JSON.parse(fs.readFileSync(p, "utf8"));
    return o && typeof o === "object" ? (o as Record<string, any>) : {};
  } catch (e) {
    throw new Error(`${p} is not valid JSON: ${(e as Error).message}`);
  }
}

export function loadConfig(root: string): ProjectConfig {
  const raw = loadRawConfig(root);
  const cfg: ProjectConfig = { ...DEFAULT_CONFIG, server: null, ...(raw as Partial<ProjectConfig>) };
  cfg.server = typeof raw.server === "string" && raw.server.trim() ? raw.server.trim() : null;
  cfg.image = typeof raw.image === "string" && raw.image.trim() ? raw.image.trim() : null;
  if (!Array.isArray(cfg.excludeGlobs)) cfg.excludeGlobs = [];
  if (raw.env && typeof raw.env === "object") {
    cfg.env = {
      carryFiles: Array.isArray(raw.env.carryFiles) ? raw.env.carryFiles.map(String) : [],
      excludeVars: Array.isArray(raw.env.excludeVars) ? raw.env.excludeVars.map(String) : [],
      overrideVars:
        raw.env.overrideVars && typeof raw.env.overrideVars === "object" ? { ...raw.env.overrideVars } : {},
    };
  } else {
    cfg.env = null;
  }
  return cfg;
}

/** Merge a partial into the on-disk config, preserving every other key. */
export function patchConfig(root: string, patch: Record<string, any>): string {
  const raw = loadRawConfig(root);
  const next = { ...raw, ...patch };
  const p = configPath(root);
  fs.writeFileSync(p, JSON.stringify(next, null, 2) + "\n");
  return p;
}

/**
 * Persist env-carry decisions. `overrideVars` is deliberately NOT written back:
 * it holds values, and .stepaway.json is a file people commit.
 */
export function rememberEnvChoice(root: string, choice: { carryFiles: string[]; excludeVars: string[] }): string {
  const raw = loadRawConfig(root);
  const prev = raw.env && typeof raw.env === "object" ? raw.env : {};
  return patchConfig(root, { env: { ...prev, carryFiles: choice.carryFiles, excludeVars: choice.excludeVars } });
}

/** Config file + CLI flag overrides. Flags win. */
export function resolveConfig(root: string, flags: Record<string, any>): ProjectConfig {
  const cfg = loadConfig(root);
  if (flags["remote-base"]) cfg.remotePathBase = String(flags["remote-base"]);
  if (flags.server) cfg.server = String(flags.server);
  return cfg;
}

/**
 * The backend client for this project: `--server`/`--server-token` beat
 * `.stepaway.json`, which beats `~/.config/stepaway/config.json`. Returns null
 * (with a message) rather than throwing, so every command can print the same
 * "run stepaway auth" nudge in its own voice.
 */
export function openClient(
  root: string | null,
  flags: Record<string, any>,
  /** the baton's server, when a command is following an existing handoff. */
  preferServer?: string | null,
): { client: Client; server: string } | { client: null; error: string } {
  const projectServer = preferServer ?? (root ? loadConfig(root).server : null);
  const r = resolveClient(flags, projectServer, readClientConfig());
  if (!r.server || !r.token) return { client: null, error: NOT_CONFIGURED };
  return { client: new Client({ server: r.server, token: r.token }), server: r.server };
}

export function batonPath(root: string): string {
  return path.join(root, ".git", "stepaway-baton.json");
}

export function readBaton(root: string): Baton | null {
  const p = batonPath(root);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as Baton;
  } catch {
    return null;
  }
}

export function writeBaton(root: string, b: Baton): void {
  fs.mkdirSync(path.dirname(batonPath(root)), { recursive: true });
  fs.writeFileSync(batonPath(root), JSON.stringify(b, null, 2) + "\n");
}

export function clearBaton(root: string): void {
  try {
    fs.rmSync(batonPath(root));
  } catch {
    /* ignore */
  }
}
