/**
 * Entry point: wire the real cluster client into the app and serve.
 *
 * The only background work in the whole backend is the `pending -> ready`
 * poll (SPEC-v0.2 §3: "the backend absorbs waitRunner"). Everything else is
 * derived on read, so losing this process loses nothing that matters — a
 * restart re-derives every session from the cluster, and a session that was
 * still pending gets re-probed the next time anyone reads it.
 */

import { advanceBuild, createApp, type AppDeps, type BuildWatch } from "./app.js";
import { loadConfig, VERSION } from "./config.js";
import { RestK8s, type K8s } from "./k8s.js";
import { bashLine } from "./sh.js";
import { ANN } from "./sessions.js";

const READY_POLL_MS = 3_000;
const READY_TIMEOUT_MS = 10 * 60_000;

/** Poll `claude --version` until the runner can actually run it. */
export function pollUntilReady(k8s: K8s, podName: string): void {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  void (async () => {
    for (;;) {
      if (Date.now() > deadline) {
        await k8s
          .patchPodAnnotations(podName, {
            [ANN.detail]: `runner not ready after ${Math.round(READY_TIMEOUT_MS / 1000)}s`,
          })
          .catch(() => undefined);
        return;
      }
      await new Promise((r) => setTimeout(r, READY_POLL_MS));
      try {
        const pod = await k8s.getPod(podName);
        if (!pod || pod.metadata.deletionTimestamp) return;
        const state = pod.metadata.annotations?.[ANN.state];
        if (state && state !== "pending") return; // someone else moved it on
        const r = await k8s.exec(podName, bashLine("claude --version"), { timeoutMs: 15_000 });
        if (r.code === 0) {
          await k8s.patchPodAnnotations(podName, { [ANN.state]: "ready", [ANN.detail]: null });
          return;
        }
      } catch {
        // pod still booting (exec refuses until the container runs): keep going
      }
    }
  })();
}

const BUILD_POLL_MS = 5_000;
/** activeDeadlineSeconds is 1200; give the watcher room to see the verdict. */
const BUILD_TIMEOUT_MS = 30 * 60_000;

/**
 * Watch a devcontainer build to its verdict (SPEC-v0.3). Same shape as the
 * ready poll above, and just as disposable: advanceBuild() is idempotent and
 * reads everything it needs from the cluster, so a backend restart only costs
 * the session the delay until someone calls advanceBuild again.
 */
export function pollBuild(deps: AppDeps, watch: BuildWatch): void {
  const deadline = Date.now() + BUILD_TIMEOUT_MS;
  void (async () => {
    for (;;) {
      await new Promise((r) => setTimeout(r, BUILD_POLL_MS));
      try {
        const state = await advanceBuild(deps, watch);
        if (state !== "building") return;
      } catch (e) {
        console.warn(`stepaway: build watch ${watch.hash} failed a step: ${(e as Error).message}`);
      }
      if (Date.now() > deadline) {
        await deps.k8s
          .patchPvcAnnotations(watch.name, {
            [ANN.state]: "failed",
            [ANN.detail]: `the env build did not finish within ${Math.round(BUILD_TIMEOUT_MS / 60_000)}m`,
          })
          .catch(() => undefined);
        return;
      }
    }
  })();
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.token) {
    console.error("STEPAWAY_TOKEN is not set — every authenticated route will answer 503");
  }
  const k8s = await RestK8s.create({ namespace: config.namespace });
  const deps: AppDeps = {
    k8s,
    config,
    onSessionCreated: (pod) => pollUntilReady(k8s, pod),
    onBuildStarted: (watch) => pollBuild(deps, watch),
  };
  const app = createApp(deps);
  if (config.registry.host) {
    console.log(`stepaway: devcontainer builds enabled — registry ${config.registry.host}`);
  }
  console.log(`stepaway backend ${VERSION} — namespace ${k8s.namespace}, port ${config.port}`);
  Bun.serve({ port: config.port, hostname: "0.0.0.0", fetch: app.fetch, idleTimeout: 0 });
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(`fatal: ${(e as Error).message}`);
    process.exit(1);
  });
}
