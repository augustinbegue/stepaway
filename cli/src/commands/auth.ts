import { spawn } from "node:child_process";
import { which } from "../sh.js";
import { projectRoot, loadConfig } from "../config.js";
import { Client } from "../client.js";
import { Ui } from "../ui.js";
import {
  clientConfigPath,
  normalizeServer,
  readClientConfig,
  resolveClient,
  writeClientConfig,
} from "../clientconfig.js";

/** `claude setup-token` prints exactly this shape. */
const TOKEN_RE = /\b(sk-ant-oat[A-Za-z0-9_-]{20,})/;

export function findToken(text: string): string | null {
  const m = TOKEN_RE.exec(text);
  return m ? m[1] : null;
}

/**
 * How to give `claude setup-token` a pseudo-terminal using the platform's
 * `script` binary. Without a pty the TUI thinks it is writing to a file and
 * reprints every frame in full, which is the redraw spam users saw on macOS.
 *
 * The two `script` implementations take incompatible arguments:
 *   BSD/macOS:  script -q <typescript-file> <cmd> [args...]
 *   util-linux: script -qec "<cmd>" <typescript-file>
 */
export function ptyCommand(platform: string): { cmd: string; args: string[] } {
  if (platform === "darwin") return { cmd: "script", args: ["-q", "/dev/null", "claude", "setup-token"] };
  return { cmd: "script", args: ["-qec", "claude setup-token", "/dev/null"] };
}

/**
 * Run `claude setup-token` interactively and lift the token out of its output.
 *
 * stdin and stderr are inherited so the user can complete the browser OAuth
 * flow normally; stdout is piped through us and forwarded RAW — byte for byte,
 * no line splitting, no re-echo — so cursor moves and repaints land where the
 * TUI intends and the session looks native. We only tee a copy into a buffer to
 * scan for the token. The token is never written to disk here; it goes straight
 * to the backend, which stores it as a k8s Secret.
 */
function runSetupToken(usePty: boolean): Promise<{ token: string | null; code: number }> {
  return new Promise((resolve) => {
    const { cmd, args } = usePty ? ptyCommand(process.platform) : { cmd: "claude", args: ["setup-token"] };
    const child = spawn(cmd, args, { stdio: ["inherit", "pipe", "inherit"] });
    let buf = "";
    child.stdout.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk);
      buf += chunk.toString("utf8");
      if (buf.length > 1_000_000) buf = buf.slice(-100_000);
    });
    child.on("error", () => resolve({ token: null, code: 127 }));
    child.on("close", (code) => resolve({ token: findToken(buf), code: code ?? 1 }));
  });
}

/**
 * Two credentials, one command:
 *   1. the backend URL + bearer token (from the Helm chart's NOTES.txt) — saved
 *      to ~/.config/stepaway/config.json, mode 600;
 *   2. the Claude OAuth token — never saved locally, PUT straight to the
 *      backend, which owns the k8s Secret.
 */
export async function cmdAuth(args: string[], flags: Record<string, any>): Promise<number> {
  const ui = Ui.from(flags);
  const root = projectRoot(args[0] ?? process.cwd());
  const projectServer = loadConfig(root).server;
  const global = readClientConfig();
  const pre = resolveClient(flags, projectServer, global);

  let server = pre.server;
  let bearer = pre.token;

  if (!server) {
    // one TTY gate: the Ui decides whether anything can be asked
    if (!ui.interactive) {
      ui.error(
        "no backend URL. Re-run with:",
        "  stepaway auth --server https://stepaway.example.com --server-token <token>",
      );
      return 1;
    }
    const a = (await ui.text("backend URL", "https://stepaway.example.com")).trim();
    if (!a) {
      ui.error("no backend URL; nothing stored");
      return 1;
    }
    server = normalizeServer(a);
  }
  if (!bearer) {
    if (!ui.interactive) {
      ui.error("no bearer token. Re-run with --server-token <token> (see the chart's NOTES.txt)");
      return 1;
    }
    bearer = (await ui.text("bearer token (from the Helm chart's NOTES.txt)")).trim() || null;
  }
  if (!bearer) {
    ui.error("no bearer token; nothing stored");
    return 1;
  }

  // 1. verify before persisting: an authenticated call, not just a ping
  const client = new Client({ server, token: bearer });
  let skewNote: string | null = null;
  try {
    const skew = await client.checkVersion();
    if (skew.fatal) {
      ui.error(skew.message ?? "incompatible backend version");
      return 1;
    }
    skewNote = skew.message;
  } catch (e) {
    ui.error(`could not authenticate against ${server}: ${(e as Error).message}`);
    return 1;
  }

  const cfgPath = writeClientConfig({ server, token: bearer });
  ui.raw(`backend ${server} verified; saved to ${cfgPath} (mode 600)\n`);
  if (skewNote) ui.warn(skewNote);

  // 2. the Claude OAuth token
  let token: string | null = flags.token ? String(flags.token) : null;

  if (!token) {
    if (!which("claude")) {
      ui.error(
        "claude is not on PATH. Install Claude Code, or pass an existing token:",
        "  stepaway auth --token <sk-ant-oat...>",
      );
      return 1;
    }
    // a pty keeps the TUI from repainting every frame into our pipe
    const usePty = which("script");
    ui.raw(`\nrunning: claude setup-token\n(complete the sign-in in your browser)\n\n`);
    const r = await runSetupToken(usePty);
    token = r.token;
    if (!token) {
      if (!ui.interactive) {
        ui.error(`could not read a token from 'claude setup-token' (exit ${r.code}). Re-run with --token <value>.`);
        return 1;
      }
      ui.raw("\n");
      token = (await ui.text("could not detect the token in that output — paste it here")).trim() || null;
    }
  }

  if (!token) {
    ui.error("no token; nothing stored on the backend");
    return 1;
  }
  if (!/^sk-ant-/.test(token)) {
    ui.error("that does not look like a Claude OAuth token (expected sk-ant-oat…)");
    return 1;
  }

  try {
    await client.putClaudeToken(token);
  } catch (e) {
    ui.error(`backend refused the Claude token: ${(e as Error).message}`);
    return 1;
  }
  token = "";

  ui.raw(
    `\nstored your Claude token on ${server}\n` +
      `runner pods read it as CLAUDE_CODE_OAUTH_TOKEN. Re-run 'stepaway auth' any time to rotate.\n` +
      `config: ${clientConfigPath()}\n`,
  );
  return 0;
}
