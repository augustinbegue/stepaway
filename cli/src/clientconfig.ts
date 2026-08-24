import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * The *machine-scoped* client config: which backend this laptop talks to and
 * with what bearer token (SPEC-v0.2 §4). Lives outside the project on purpose —
 * `.stepaway.json` is a file people commit, and this holds a credential.
 *
 *   ~/.config/stepaway/config.json   (XDG_CONFIG_HOME respected)
 *
 * Written 0600, read back with a warning if the mode is looser.
 */

export type ClientConfig = { server: string; token: string };

export function configHome(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  const xdg = env.XDG_CONFIG_HOME;
  return xdg && xdg.trim() ? xdg : path.join(home, ".config");
}

export function clientConfigPath(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  return path.join(configHome(env, home), "stepaway", "config.json");
}

export function readClientConfig(): Partial<ClientConfig> {
  const p = clientConfigPath();
  if (!fs.existsSync(p)) return {};
  try {
    const o = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!o || typeof o !== "object") return {};
    return {
      server: typeof o.server === "string" ? o.server : undefined,
      token: typeof o.token === "string" ? o.token : undefined,
    };
  } catch (e) {
    throw new Error(`${p} is not valid JSON: ${(e as Error).message}`);
  }
}

export function writeClientConfig(cfg: ClientConfig): string {
  const p = clientConfigPath();
  fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
  // create with 0600 from the start: never a window where the token is world-readable
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
  try {
    fs.chmodSync(p, 0o600);
  } catch {
    /* best effort on filesystems without unix modes */
  }
  return p;
}

/** Trim a trailing slash so route templates concatenate cleanly. */
export function normalizeServer(url: string): string {
  const s = url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(s)) throw new Error(`server must be an http(s) URL: ${url}`);
  return s;
}

export type Resolved = { server: string | null; token: string | null; sources: { server: string; token: string } };

/**
 * Precedence for the endpoint: flags > project `.stepaway.json` > global config.
 * The token is never project-scoped (it is a credential): flags > global.
 */
export function resolveClient(
  flags: Record<string, any>,
  projectServer: string | null | undefined,
  global: Partial<ClientConfig> = readClientConfig(),
): Resolved {
  let server: string | null = null;
  let serverSrc = "unset";
  if (flags.server) {
    server = String(flags.server);
    serverSrc = "--server";
  } else if (projectServer) {
    server = String(projectServer);
    serverSrc = ".stepaway.json";
  } else if (global.server) {
    server = global.server;
    serverSrc = "global config";
  }
  let token: string | null = null;
  let tokenSrc = "unset";
  if (flags["server-token"]) {
    token = String(flags["server-token"]);
    tokenSrc = "--server-token";
  } else if (global.token) {
    token = global.token;
    tokenSrc = "global config";
  }
  return {
    server: server ? normalizeServer(server) : null,
    token,
    sources: { server: serverSrc, token: tokenSrc },
  };
}

export const NOT_CONFIGURED =
  "no backend configured — run: stepaway auth --server https://stepaway.example.com --server-token <token>\n" +
  "(the token is printed by the Helm chart's NOTES.txt on install)";
