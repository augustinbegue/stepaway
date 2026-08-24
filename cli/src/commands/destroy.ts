import { confirm, isTTY } from "../sh.js";
import { clearBaton, openClient, projectRoot, readBaton } from "../config.js";

/**
 * Tear down an abandoned handoff. Unlike `pull`, this makes no attempt to bring
 * anything home — everything on the pod, including commits on the PVC, is
 * discarded. Hence the confirm.
 */
export async function cmdDestroy(args: string[], flags: Record<string, any>): Promise<number> {
  const root = projectRoot(args[0] ?? process.cwd());
  const baton = readBaton(root);
  const sessionId = flags.session ? String(flags.session) : baton?.id;
  if (!sessionId) {
    process.stderr.write(
      `no handoff baton for ${root}; name the session to destroy:\n  stepaway destroy --session <id>\n` +
        `  ('stepaway status' lists what the backend is running)\n`,
    );
    return 1;
  }
  const opened = openClient(root, flags, baton?.server);
  if (!opened.client) {
    process.stderr.write(`${opened.error}\n`);
    return 1;
  }
  const client = opened.client;

  process.stdout.write(
    `destroy session ${sessionId} on ${client.server}\n` +
      `  deletes the pod AND its PVC: any commits still only on the runner are lost.\n` +
      (baton ? `  handed off ${baton.pushedAt}, transcript ${baton.sessionId ?? "(none)"}\n` : "") +
      `  to keep the work instead, run: stepaway pull\n\n`,
  );
  if (!flags.yes) {
    if (!isTTY()) {
      process.stderr.write("refusing to destroy without confirmation: re-run with --yes (no TTY)\n");
      return 1;
    }
    if (!confirm("Destroy? [y/N] ")) {
      process.stderr.write("aborted\n");
      return 1;
    }
  }

  try {
    await client.deleteSession(sessionId);
  } catch (e) {
    process.stderr.write(`could not delete session ${sessionId}: ${(e as Error).message}\n`);
    return 1;
  }
  if (baton && baton.id === sessionId) clearBaton(root);
  process.stdout.write(`deleted session ${sessionId} (pod + PVC)\n`);
  return 0;
}
