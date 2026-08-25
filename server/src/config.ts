/**
 * Server configuration — env only (the Helm chart is the one that sets it).
 */

import type { RunnerOverrides } from "@stepaway/core";

/**
 * Shared repo version (SPEC-v0.2 §5: "server and CLI share the repo version").
 * Kept as a literal so the bundled single-file image has no filesystem lookup;
 * server/test/version.test.ts fails the build if it drifts from package.json.
 */
export const VERSION = "0.3.1";

export type ServerConfig = {
  port: number;
  /** namespace override; normally read from the ServiceAccount mount. */
  namespace?: string;
  /** bearer token every route but /v1/healthz requires. */
  token: string;
  runner: RunnerOverrides;
};

/**
 * Every RUNNER_* variable this server reads. The chart's deployment.yaml must
 * set exactly these names — server/test/chart.test.ts asserts set-equality, so
 * a rename on either side fails CI instead of silently ignoring a value.
 */
export const RUNNER_ENV_NAMES = [
  "RUNNER_IMAGE",
  "RUNNER_CPU_REQUEST",
  "RUNNER_MEMORY_REQUEST",
  "RUNNER_MEMORY_LIMIT",
  "RUNNER_STORAGE_CLASS",
  "RUNNER_STORAGE_SIZE",
  "RUNNER_DIND_ENABLED",
] as const;

/** "false"/"0"/"no"/"off" (any case) is false; anything else keeps the default. */
function boolEnv(raw: string | undefined): boolean | undefined {
  if (raw === undefined || raw === "") return undefined;
  return !/^(false|0|no|off)$/i.test(raw.trim());
}

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
      dindEnabled: boolEnv(env.RUNNER_DIND_ENABLED),
    },
  };
}
