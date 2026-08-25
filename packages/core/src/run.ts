/**
 * The unattended-run contract, pure. v0.1 kept this in the CLI; v0.2 moves it
 * to core because the *backend* now launches runs (SPEC-v0.2 §3) and the CLI
 * only asks for one.
 */

/** Default goal when the user gives none: orient, then continue. */
export const DEFAULT_INSTRUCTION =
  "You were handed off mid-task to a runner. Review the last few turns and the working tree, then continue the task in progress.";

/** Durability guidance appended to the system prompt of every unattended run. */
export const COMMIT_GUIDANCE =
  "Commit locally after each coherent unit of work — the repository survives crashes, the working tree does not.";

/** Remote base used when a session carries no `remotePathBase` override. */
export const DEFAULT_REMOTE_BASE = "/work";

/**
 * The backend's scratch directory inside the runner, under whatever remote base
 * the session was created with (`remotePathBase`, default /work). Everything
 * below is derived from it so a non-default base is honoured end to end.
 */
export function stepawayDir(remoteBase: string = DEFAULT_REMOTE_BASE): string {
  const base = (remoteBase || DEFAULT_REMOTE_BASE).replace(/\/+$/, "") || "";
  return `${base}/.stepaway`;
}

/** Where the launch wrapper tees its log, for a given remote base. */
export function runLogPath(remoteBase: string = DEFAULT_REMOTE_BASE): string {
  return `${stepawayDir(remoteBase)}/run.log`;
}

/** The process-exit marker that makes `running -> done|failed` derivable. */
export function exitMarkerPath(remoteBase: string = DEFAULT_REMOTE_BASE): string {
  return `${stepawayDir(remoteBase)}/exit-code`;
}

/**
 * Default-base conveniences, kept for callers that have no session in hand.
 * Prefer the functions above wherever a remote base is known.
 */
export const RUN_LOG = runLogPath();
export const EXIT_MARKER = exitMarkerPath();

/**
 * Strongest auto-approval mode the installed CLI supports, probed from its own
 * --help so we never pass a flag a given version does not know.
 */
export function permissionFlags(helpText: string): { flags: string[]; warn: string | null } {
  const help = helpText.toLowerCase();
  if (help.includes("--permission-mode")) {
    if (/\bauto\b/.test(help)) return { flags: ["--permission-mode", "auto"], warn: null };
    if (help.includes("acceptedits")) return { flags: ["--permission-mode", "acceptEdits"], warn: null };
  }
  return {
    flags: ["--dangerously-skip-permissions"],
    warn:
      "warning: the runner's claude has no --permission-mode auto/acceptEdits; " +
      "falling back to --dangerously-skip-permissions for the unattended run.",
  };
}
