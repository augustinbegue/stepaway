/**
 * Entry point: wire the real cluster client into the app and serve.
 *
 * The only background work in the whole backend is the `pending -> ready`
 * poll (SPEC-v0.2 §3: "the backend absorbs waitRunner"). Everything else is
 * derived on read, so losing this process loses nothing that matters — a
 * restart re-derives every session from the cluster, and a session that was
 * still pending gets re-probed the next time anyone reads it.
 */

import { createApp } from "./app.js";
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

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.token) {
    console.error("STEPAWAY_TOKEN is not set — every authenticated route will answer 503");
  }
  const k8s = await RestK8s.create({ namespace: config.namespace });
  const app = createApp({ k8s, config, onSessionCreated: (pod) => pollUntilReady(k8s, pod) });
  console.log(`stepaway backend ${VERSION} — namespace ${k8s.namespace}, port ${config.port}`);
  Bun.serve({ port: config.port, hostname: "0.0.0.0", fetch: app.fetch, idleTimeout: 0 });
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(`fatal: ${(e as Error).message}`);
    process.exit(1);
  });
}
