import * as path from "node:path";
import { remoteGitDir, remoteProjectPath, type Session } from "@stepaway/core";
import { openClient, projectRoot, readBaton, resolveConfig } from "../config.js";
import { Ui, colorize, pad } from "../ui.js";

/** The state field is the headline: everything else is context for it. */
function tintState(state: string, k: ReturnType<typeof colorize>): string {
  if (state === "failed") return k.bad(k.bold(state));
  if (state === "done") return k.ok(k.bold(state));
  if (state === "running") return k.cyan(k.bold(state));
  return k.warn(k.bold(state));
}

/** Only the states whose name does not explain itself get a gloss. */
function stateNote(state: string | undefined): string {
  if (state === "building") return " (building the devcontainer env image — first push with this env config)";
  return "";
}

export async function cmdStatus(args: string[], flags: Record<string, any>): Promise<number> {
  const ui = Ui.from(flags);
  const root = projectRoot(args[0] ?? process.cwd());
  const cfg = resolveConfig(root, flags);
  const baton = readBaton(root);
  const k = colorize(ui.fancy);

  const opened = openClient(root, flags, baton?.server);
  if (!opened.client) {
    ui.error(opened.error);
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
      ui.raw(JSON.stringify({ project: root, handoff: false, server: client.server, sessions, error: err }, null, 2) + "\n");
      return err ? 1 : 0;
    }
    ui.raw(
      `project: ${root}\nno active handoff (push with: stepaway push)\n` +
        `backend: ${client.server}\n` +
        `default remote working tree would be ${remoteProjectPath(cfg, root)}\n\n`,
    );
    if (err) {
      ui.error(`could not list sessions: ${err}`);
      return 1;
    }
    if (!sessions.length) {
      ui.raw("sessions: (none)\n");
      return 0;
    }
    const w = (f: (s: Session) => string, head: string) =>
      Math.max(head.length, ...sessions.map((s) => f(s).length)) + 2;
    const idW = w((s) => s.id, "SESSION");
    const projW = w((s) => s.project ?? "", "PROJECT");
    const stW = w((s) => s.state ?? "", "STATE");
    ui.raw(
      k.dim(`${pad("SESSION", idW)}${pad("PROJECT", projW)}${pad("STATE", stW)}CREATED`) + "\n",
    );
    for (const s of sessions) {
      ui.raw(
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
    ui.raw(JSON.stringify({ project: root, handoff: true, baton, session: s, error: err }, null, 2) + "\n");
    return err ? 1 : 0;
  }

  ui.raw(
    `project:    ${root} (${path.basename(root)})\n` +
      `handed off: ${baton.pushedAt}\n` +
      `backend:    ${baton.server}\n` +
      `session:    ${baton.id}${baton.sessionId && baton.sessionId !== baton.id ? ` (transcript ${baton.sessionId})` : ""}\n` +
      `state:      ${s ? tintState(s.state, k) : k.bad("unknown")}` +
      stateNote(s?.state) +
      (s?.exitCode !== undefined && s?.exitCode !== null ? ` (exit ${s.exitCode})` : "") +
      `\n` +
      (s?.detail ? `detail:     ${s.detail}\n` : "") +
      (err ? `error:      ${err}\n` : "") +
      `pod:        ${s?.podName || (s?.state === "building" ? "(not created yet — env image building)" : "(unknown)")}\n` +
      `work tree:  ${baton.remotePath}\n` +
      `git dir:    ${remoteGitDir(root)} (on the session PVC)\n` +
      `\nwatch:       stepaway peek -f\n` +
      `bring back:  stepaway pull\n` +
      `abandon:     stepaway destroy\n`,
  );
  return err ? 1 : 0;
}
