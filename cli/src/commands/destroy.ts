import { clearBaton, openClient, projectRoot, readBaton } from "../config.js";
import { Ui } from "../ui.js";

/**
 * Tear down an abandoned handoff. Unlike `pull`, this makes no attempt to bring
 * anything home — everything on the pod, including commits on the PVC, is
 * discarded. Hence the confirm.
 */
export async function cmdDestroy(args: string[], flags: Record<string, any>): Promise<number> {
  const ui = Ui.from(flags);
  const root = projectRoot(args[0] ?? process.cwd());
  const baton = readBaton(root);
  const sessionId = flags.session ? String(flags.session) : baton?.id;
  if (!sessionId) {
    ui.error(
      `no handoff baton for ${root}; name the session to destroy:`,
      `  stepaway destroy --session <id>\n  ('stepaway status' lists what the backend is running)`,
    );
    return 1;
  }
  const opened = openClient(root, flags, baton?.server);
  if (!opened.client) {
    ui.error(opened.error);
    return 1;
  }
  const client = opened.client;

  ui.raw(
    `destroy session ${sessionId} on ${client.server}\n` +
      `  deletes the pod AND its PVC: any commits still only on the runner are lost.\n` +
      (baton ? `  handed off ${baton.pushedAt}, transcript ${baton.sessionId ?? "(none)"}\n` : "") +
      `  to keep the work instead, run: stepaway pull\n\n`,
  );
  if (!flags.yes) {
    // one TTY gate: the Ui knows whether a question can be asked at all
    if (!ui.interactive) {
      ui.error("refusing to destroy without confirmation: re-run with --yes (no TTY)");
      return 1;
    }
    if (!(await ui.confirm("Destroy?", false))) {
      ui.error("aborted");
      return 1;
    }
  }

  try {
    await client.deleteSession(sessionId);
  } catch (e) {
    ui.error(`could not delete session ${sessionId}: ${(e as Error).message}`);
    return 1;
  }
  if (baton && baton.id === sessionId) clearBaton(root);
  ui.raw(`deleted session ${sessionId} (pod + PVC)\n`);
  return 0;
}
