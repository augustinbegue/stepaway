import * as path from "node:path";
import { remoteGitDir, remoteProjectPath, type Session } from "@stepaway/core";
import { openClient, projectRoot, readBaton, resolveConfig } from "../config.js";
import { colorize, pad } from "../ui.js";

/** The state field is the headline: everything else is context for it. */
function tintState(state: string, k: ReturnType<typeof colorize>): string {
  if (state === "failed") return k.bad(k.bold(state));
  if (state === "done") return k.ok(k.bold(state));
  if (state === "running") return k.cyan(k.bold(state));
  return k.warn(k.bold(state));
}

export async function cmdStatus(args: string[], flags: Record<string, any>): Promise<number> {
  const root = projectRoot(args[0] ?? process.cwd());
  const cfg = resolveConfig(root, flags);
  const baton = readBaton(root);
  const k = colorize(Boolean(process.stdout.isTTY) && !flags.json);

  const opened = openClient(root, flags, baton?.server);
  if (!opened.client) {
    process.stderr.write(`${opened.error}\n`);
    return 1;
  }
  const client = opened.client;

  if (!baton) {
    // no baton: show what this backend is running for anyone
    let sessions: Session[] = [];
    let err: string | null = null;
    try {
      sessions = await client.listSessions();
    } catch (e) {
      err = (e as Error).message;
    }
    if (flags.json) {
      process.stdout.write(JSON.stringify({ project: root, handoff: false, server: client.server, sessions, error: err }, null, 2) + "\n");
      return err ? 1 : 0;
    }
    process.stdout.write(
      `project: ${root}\nno active handoff (push with: stepaway push)\n` +
        `backend: ${client.server}\n` +
        `default remote working tree would be ${remoteProjectPath(cfg, root)}\n\n`,
    );
    if (err) {
      process.stderr.write(`could not list sessions: ${err}\n`);
      return 1;
    }
    if (!sessions.length) {
      process.stdout.write("sessions: (none)\n");
      return 0;
    }
    const w = (f: (s: Session) => string, head: string) =>
      Math.max(head.length, ...sessions.map((s) => f(s).length)) + 2;
    const idW = w((s) => s.id, "SESSION");
    const projW = w((s) => s.project ?? "", "PROJECT");
    const stW = w((s) => s.state ?? "", "STATE");
    process.stdout.write(
      k.dim(`${pad("SESSION", idW)}${pad("PROJECT", projW)}${pad("STATE", stW)}CREATED`) + "\n",
    );
    for (const s of sessions) {
      process.stdout.write(
        `${pad(s.id, idW)}${pad(s.project ?? "", projW)}${pad(s.state ?? "", stW)}${s.createdAt ?? ""}\n`,
      );
    }
    return 0;
  }

  let s: Session | null = null;
  let err: string | null = null;
  try {
    s = await client.getSession(baton.id);
  } catch (e) {
    err = (e as Error).message;
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify({ project: root, handoff: true, baton, session: s, error: err }, null, 2) + "\n");
    return err ? 1 : 0;
  }

  process.stdout.write(
    `project:    ${root} (${path.basename(root)})\n` +
      `handed off: ${baton.pushedAt}\n` +
      `backend:    ${baton.server}\n` +
      `session:    ${baton.id}${baton.sessionId && baton.sessionId !== baton.id ? ` (transcript ${baton.sessionId})` : ""}\n` +
      `state:      ${s ? tintState(s.state, k) : k.bad("unknown")}` +
      (s?.exitCode !== undefined && s?.exitCode !== null ? ` (exit ${s.exitCode})` : "") +
      `\n` +
      (s?.detail ? `detail:     ${s.detail}\n` : "") +
      (err ? `error:      ${err}\n` : "") +
      `pod:        ${s?.podName ?? "(unknown)"}\n` +
      `work tree:  ${baton.remotePath}\n` +
      `git dir:    ${remoteGitDir(root)} (on the session PVC)\n` +
      `\nwatch:       stepaway peek -f\n` +
      `bring back:  stepaway pull\n` +
      `abandon:     stepaway destroy\n`,
  );
  return err ? 1 : 0;
}
