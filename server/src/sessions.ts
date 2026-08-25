/**
 * The session registry — which is not a registry: there is no map, no DB, no
 * in-memory state (SPEC-v0.2 §1 "Stateless: all state is k8s objects and the
 * runner pods themselves").
 *
 * Every session fact lives on the runner pod:
 *   labels      stepaway.dev/session=<sid>   (the selector for list/destroy)
 *   annotations stepaway.dev/project         project basename
 *               stepaway.dev/created-at      ISO 8601, ours not the pod's
 *               stepaway.dev/state           last state the backend *wrote*
 *               stepaway.dev/remote-base     e.g. /work
 *               stepaway.dev/work-tree       set once the restore picked it
 *               stepaway.dev/exit-code       from the launch wrapper's marker
 *               stepaway.dev/detail          human error line, never a value
 *
 * Two edges are derived lazily on read instead of watched:
 *   pending -> ready   `claude --version` answers (absorbs the CLI's waitRunner)
 *   running -> done|failed   <remote-base>/.stepaway/exit-code exists
 * Both write the result back as an annotation, so a backend restart re-derives
 * everything from the cluster and loses nothing.
 */

import {
  DEFAULT_REMOTE_BASE,
  SESSION_LABEL,
  exitMarkerPath,
  type Session,
  type SessionState,
} from "@stepaway/core";
import type { K8s, PodObject } from "./k8s.js";
import { bashLine } from "./sh.js";

export const ANN = {
  project: "stepaway.dev/project",
  createdAt: "stepaway.dev/created-at",
  state: "stepaway.dev/state",
  remoteBase: "stepaway.dev/remote-base",
  workTree: "stepaway.dev/work-tree",
  exitCode: "stepaway.dev/exit-code",
  detail: "stepaway.dev/detail",
} as const;

export { DEFAULT_REMOTE_BASE };

/** The session's remote base (`remotePathBase` at create time), default /work. */
export function remoteBaseOf(pod: PodObject): string {
  const raw = pod.metadata.annotations?.[ANN.remoteBase] || DEFAULT_REMOTE_BASE;
  return raw.replace(/\/+$/, "") || "/";
}

const STATES: SessionState[] = ["pending", "restoring", "ready", "running", "done", "failed"];

function annotationState(pod: PodObject): SessionState {
  const raw = pod.metadata.annotations?.[ANN.state];
  return (STATES as string[]).includes(raw ?? "") ? (raw as SessionState) : "pending";
}

export function sessionIdOf(pod: PodObject): string {
  return pod.metadata.labels?.[SESSION_LABEL] ?? pod.metadata.name;
}

/** Work tree for a session: the restore's target, or where it will be. */
export function workTreeOf(pod: PodObject): string {
  const a = pod.metadata.annotations ?? {};
  if (a[ANN.workTree]) return a[ANN.workTree];
  const base = remoteBaseOf(pod);
  return `${base === "/" ? "" : base}/${a[ANN.project] ?? "project"}`;
}

export function gitDirOf(pod: PodObject): string {
  return `/repo/${pod.metadata.annotations?.[ANN.project] ?? "project"}.git`;
}

function podReady(pod: PodObject): boolean {
  return (pod.status?.conditions ?? []).some((c) => c.type === "Ready" && c.status === "True");
}

/**
 * Session view of a pod, with the two lazy transitions applied (and persisted).
 * `probe: false` skips the exec probes — used by list when the caller only
 * wants what the annotations already say.
 */
export async function toSession(k8s: K8s, pod: PodObject, opts: { probe?: boolean } = {}): Promise<Session> {
  const a = pod.metadata.annotations ?? {};
  const name = pod.metadata.name;
  let state = annotationState(pod);
  let exitCode: number | null | undefined = a[ANN.exitCode] !== undefined ? Number(a[ANN.exitCode]) : undefined;
  let detail = a[ANN.detail];

  if (opts.probe !== false && !pod.metadata.deletionTimestamp) {
    if (state === "pending" && podReady(pod)) {
      // pending -> ready: claude installs at boot, so pod-Ready is not enough.
      const r = await safeExec(k8s, name, bashLine("claude --version"));
      if (r && r.code === 0) {
        state = "ready";
        await patch(k8s, name, { [ANN.state]: "ready" });
      }
    } else if (state === "running") {
      // running -> done|failed: the launch wrapper's exit marker.
      const r = await safeExec(k8s, name, bashLine(`cat ${exitMarkerPath(remoteBaseOf(pod))} 2>/dev/null || true`));
      const raw = r?.stdout.trim();
      if (raw && /^\d+$/.test(raw)) {
        exitCode = Number(raw);
        state = exitCode === 0 ? "done" : "failed";
        if (exitCode !== 0) detail = detail ?? `the unattended run exited ${exitCode}`;
        await patch(k8s, name, {
          [ANN.state]: state,
          [ANN.exitCode]: String(exitCode),
          ...(detail ? { [ANN.detail]: detail } : {}),
        });
      }
    }
  }

  const session: Session = {
    id: sessionIdOf(pod),
    project: a[ANN.project] ?? "",
    state,
    podName: name,
    createdAt: a[ANN.createdAt] ?? pod.metadata.creationTimestamp ?? new Date(0).toISOString(),
  };
  if (state === "done" || state === "failed") session.exitCode = exitCode ?? null;
  if (detail) session.detail = detail;
  return session;
}

export async function setState(
  k8s: K8s,
  podName: string,
  state: SessionState,
  extra: Record<string, string | null> = {},
): Promise<void> {
  await patch(k8s, podName, { [ANN.state]: state, ...extra });
}

async function patch(k8s: K8s, podName: string, ann: Record<string, string | null>): Promise<void> {
  try {
    await k8s.patchPodAnnotations(podName, ann);
  } catch {
    // A best-effort annotation write must never fail a request: the next read
    // re-derives the same answer from the pod.
  }
}

/**
 * A probe that cannot answer must not fail the read — but it must not vanish
 * either: a pod whose exec keeps failing is stuck in `running` forever, and the
 * log line is the only trace of why.
 */
async function safeExec(k8s: K8s, pod: string, cmd: string[]) {
  try {
    return await k8s.exec(pod, cmd, { timeoutMs: 15_000 });
  } catch (e) {
    console.warn(`stepaway: state probe failed on pod ${pod}: ${(e as Error).message}`);
    return null;
  }
}
