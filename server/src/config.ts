/**
 * Server configuration — env only (the Helm chart is the one that sets it).
 */

import type { RunnerOverrides } from "@stepaway/core";

/**
 * Shared repo version (SPEC-v0.2 §5: "server and CLI share the repo version").
 * Kept as a literal so the bundled single-file image has no filesystem lookup;
 * server/test/version.test.ts fails the build if it drifts from package.json.
 */
export const VERSION = "0.3.0";

export type ServerConfig = {
  port: number;
  /** namespace override; normally read from the ServiceAccount mount. */
  namespace?: string;
  /** bearer token every route but /v1/healthz requires. */
  token: string;
  runner: RunnerOverrides;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  return {
    port: Number(env.PORT ?? 8080),
    namespace: env.STEPAWAY_NAMESPACE || undefined,
    token: env.STEPAWAY_TOKEN ?? "",
    runner: {
      image: env.RUNNER_IMAGE || undefined,
      cpuRequest: env.RUNNER_CPU_REQUEST || undefined,
      memoryRequest: env.RUNNER_MEMORY_REQUEST || undefined,
      memoryLimit: env.RUNNER_MEMORY_LIMIT || undefined,
      storageClass: env.RUNNER_STORAGE_CLASS || undefined,
      storageSize: env.RUNNER_STORAGE_SIZE || undefined,
    },
  };
}
