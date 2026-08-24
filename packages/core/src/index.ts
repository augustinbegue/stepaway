/**
 * @stepaway/core — pure shared logic between the CLI and the in-cluster
 * backend (SPEC-v0.2 §1).
 *
 * Hard rules for everything in this package:
 *   - zero runtime dependencies;
 *   - no side effects at import time;
 *   - no `node:child_process`, no filesystem access, no network. Callers read
 *     files and spawn processes and pass the data in.
 *
 * `node:path` is used for pure string arithmetic only (relative/resolve/basename).
 */

export * from "./config.js";
export * from "./manifest.js";
export * from "./capture-script.js";
export * from "./restore-script.js";
export * from "./session.js";
export * from "./env.js";
export * from "./podspec.js";
export * from "./docker-script.js";
export * from "./run.js";
export * from "./transcript.js";
export * from "./api.js";
