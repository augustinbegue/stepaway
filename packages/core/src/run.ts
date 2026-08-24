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

/** Where the launch wrapper writes its log and its process-exit marker. */
export const RUN_LOG = "/work/.stepaway/run.log";
export const EXIT_MARKER = "/work/.stepaway/exit-code";

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
