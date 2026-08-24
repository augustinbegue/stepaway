import { RESTORE_SH } from "@stepaway/core";
import { bashAsync, type RunResult } from "./sh.js";

/**
 * Laptop-side restore (the `pull` direction). The scripts themselves —
 * RESTORE_SH here and RESTORE_RUNNER_SH for the pod — live in @stepaway/core,
 * because the backend runs the runner-side one via the exec API.
 */
export function restoreLocal(
  captureDir: string,
  projectDir: string,
  branch: string,
  slug: string,
): Promise<RunResult> {
  // async: unbundles the repo and untars the working tree, so it must not
  // block the event loop while pull's spinner is up
  return bashAsync(RESTORE_SH, [captureDir, projectDir, branch, slug]);
}
