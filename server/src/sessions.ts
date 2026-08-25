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
import type { K8s, PodObject, PvcObject } from "./k8s.js";
import { bashLine } from "./sh.js";

export const ANN = {
  project: "stepaway.dev/project",
  createdAt: "stepaway.dev/created-at",
  state: "stepaway.dev/state",
  remoteBase: "stepaway.dev/remote-base",
  workTree: "stepaway.dev/work-tree",
  exitCode: "stepaway.dev/exit-code",
  detail: "stepaway.dev/detail",
  /** v0.3: devcontainer env hash this session's image is (being) built from. */
  envHash: "stepaway.dev/env-hash",
  /** v0.3: image the session pod runs (or will run, while `building`). */
  image: "stepaway.dev/image",
  /** v0.3: imagePullSecret for that image, "" for the public default. */
  pullSecret: "stepaway.dev/pull-secret",
} as const;

export { DEFAULT_REMOTE_BASE };

/**
 * Where a session's state lives.
 *
 * Normally: the runner pod's annotations. But SPEC-v0.3 adds `building`, a
 * state that exists precisely *because* there is no pod yet — the env image is
 * still being built. The PVC is created first (it already carries the session
 * label), so it is the natural home for the pre-pod annotations. Everything
 * downstream reads a `SessionRecord` and stops caring which of the two it is.
 */
export type SessionRecord = { kind: "pod"; object: PodObject } | { kind: "pvc"; object: PvcObject };

/**
 * The part of a session object every helper below actually reads: the
 * metadata. A PVC has exactly that and nothing else, which is why the two
 * kinds can share one set of accessors without a cast.
 */
export type Annotated = { metadata: PodObject["metadata"] };

export const podRecord = (object: PodObject): SessionRecord => ({ kind: "pod", object });
export const pvcRecord = (object: PvcObject): SessionRecord => ({ kind: "pvc", object });

/** The pod if it exists, else the PVC standing in for a pre-pod session. */
export async function findSessionRecord(k8s: K8s, name: string): Promise<SessionRecord | null> {
  const pod = await k8s.getPod(name);
  if (pod) return podRecord(pod);
  const pvc = await k8s.getPvc(name).catch(() => null);
  // A PVC with no state annotation is just storage mid-create, not a session.
  if (pvc?.metadata.annotations?.[ANN.state]) return pvcRecord(pvc);
  return null;
}

/** Every session: the pods, plus the PVCs whose pod does not exist yet. */
export async function listSessionRecords(k8s: K8s): Promise<SessionRecord[]> {
  const pods = await k8s.listPods(SESSION_LABEL);
  const out = pods.map(podRecord);
  const seen = new Set(pods.map((p) => p.metadata.name));
  let pvcs: PvcObject[] = [];
  try {
    pvcs = await k8s.listPvcs(SESSION_LABEL);
  } catch {
    pvcs = []; // listing PVCs must never break `stepaway ls`
  }
  for (const pvc of pvcs) {
    if (seen.has(pvc.metadata.name)) continue;
    if (!pvc.metadata.annotations?.[ANN.state]) continue;
    out.push(pvcRecord(pvc));
  }
  return out;
}

/**
 * THE annotation write: against whichever object currently holds the state.
 *
 * Two properties every caller relies on:
 *   - best effort — a failed write never fails a request, because the next
 *     read re-derives the same answer from the cluster;
 *   - the in-memory record is updated too, always, write or no write, so a
 *     caller that keeps holding `rec` sees what it just set.
 */
export async function patchRecord(k8s: K8s, rec: SessionRecord, ann: Record<string, string | null>): Promise<void> {
  try {
    if (rec.kind === "pod") await k8s.patchPodAnnotations(rec.object.metadata.name, ann);
    else await k8s.patchPvcAnnotations(rec.object.metadata.name, ann);
  } catch {
    // best effort: see the doc comment above
  }
  const merged = { ...(rec.object.metadata.annotations ?? {}) };
  for (const [k, v] of Object.entries(ann)) {
    if (v === null) delete merged[k];
    else merged[k] = v;
  }
  rec.object.metadata.annotations = merged;
}

export async function setRecordState(
  k8s: K8s,
  rec: SessionRecord,
  state: SessionState,
  extra: Record<string, string | null> = {},
): Promise<void> {
  await patchRecord(k8s, rec, { [ANN.state]: state, ...extra });
}

/** The session's remote base (`remotePathBase` at create time), default /work. */
export function remoteBaseOf(o: Annotated): string {
  const raw = o.metadata.annotations?.[ANN.remoteBase] || DEFAULT_REMOTE_BASE;
  return raw.replace(/\/+$/, "") || "/";
}

const STATES: SessionState[] = ["building", "pending", "restoring", "ready", "running", "done", "failed"];

/** The last state the backend *wrote*, validated — never a raw annotation. */
export function annotationState(o: Annotated): SessionState {
  const raw = o.metadata.annotations?.[ANN.state];
  return (STATES as string[]).includes(raw ?? "") ? (raw as SessionState) : "pending";
}

export function sessionIdOf(o: Annotated): string {
  return o.metadata.labels?.[SESSION_LABEL] ?? o.metadata.name;
}

/** Work tree for a session: the restore's target, or where it will be. */
export function workTreeOf(o: Annotated): string {
  const a = o.metadata.annotations ?? {};
  if (a[ANN.workTree]) return a[ANN.workTree];
  const base = remoteBaseOf(o);
  return `${base === "/" ? "" : base}/${a[ANN.project] ?? "project"}`;
}

export function gitDirOf(o: Annotated): string {
  return `/repo/${o.metadata.annotations?.[ANN.project] ?? "project"}.git`;
}

function podReady(pod: PodObject): boolean {
  return (pod.status?.conditions ?? []).some((c) => c.type === "Ready" && c.status === "True");
}

/**
 * Session view of a pod, with the two lazy transitions applied (and persisted).
 * `probe: false` skips the exec probes — used by list when the caller only
 * wants what the annotations already say.
 */
export async function toSession(k8s: K8s, rec: SessionRecord, opts: { probe?: boolean } = {}): Promise<Session> {
  const obj: Annotated = rec.object;
  const a = obj.metadata.annotations ?? {};
  const name = obj.metadata.name;
  let state = annotationState(obj);
  let exitCode: number | null | undefined = a[ANN.exitCode] !== undefined ? Number(a[ANN.exitCode]) : undefined;
  let detail = a[ANN.detail];

  // A `building` session has no pod to exec into: its transitions are driven
  // by the build watcher, never derived here.
  if (opts.probe !== false && rec.kind === "pod" && !rec.object.metadata.deletionTimestamp) {
    if (state === "pending" && podReady(rec.object)) {
      // pending -> ready: claude installs at boot, so pod-Ready is not enough.
      const r = await safeExec(k8s, name, bashLine("claude --version"));
      if (r && r.code === 0) {
        state = "ready";
        await patchRecord(k8s, rec, { [ANN.state]: "ready" });
      }
    } else if (state === "running") {
      // running -> done|failed: the launch wrapper's exit marker.
      const r = await safeExec(k8s, name, bashLine(`cat ${exitMarkerPath(remoteBaseOf(obj))} 2>/dev/null || true`));
      const raw = r?.stdout.trim();
      if (raw && /^\d+$/.test(raw)) {
        exitCode = Number(raw);
        state = exitCode === 0 ? "done" : "failed";
        if (exitCode !== 0) detail = detail ?? `the unattended run exited ${exitCode}`;
        await patchRecord(k8s, rec, {
          [ANN.state]: state,
          [ANN.exitCode]: String(exitCode),
          ...(detail ? { [ANN.detail]: detail } : {}),
        });
      }
    }
  }

  const session: Session = {
    id: sessionIdOf(obj),
    project: a[ANN.project] ?? "",
    state,
    podName: name,
    createdAt: a[ANN.createdAt] ?? obj.metadata.creationTimestamp ?? new Date(0).toISOString(),
  };
  if (state === "done" || state === "failed") session.exitCode = exitCode ?? null;
  if (detail) session.detail = detail;
  return session;
}

/**
 * The pod-only convenience over setRecordState(), for the routes that already
 * hold a runner pod. Same semantics, including the local-annotation update.
 */
export async function setState(
  k8s: K8s,
  pod: PodObject,
  state: SessionState,
  extra: Record<string, string | null> = {},
): Promise<void> {
  await setRecordState(k8s, podRecord(pod), state, extra);
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
