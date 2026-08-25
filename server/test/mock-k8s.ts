/**
 * In-memory K8s port for the route tests. Records everything, executes
 * nothing: exec answers are matched on the script text the route sent, which
 * doubles as an assertion that the route ran the command we think it did.
 */

import type { ExecOpts, ExecResult, JobObject, K8s, PodObject, PvcObject, StorageClassProbe } from "../src/k8s.js";

export type ExecCall = { pod: string; command: string[]; script: string; stdinBytes: number; opts: ExecOpts };
/** Return an Error to make the exec *throw* (timeout / socket drop). */
export type ExecHandler = (call: ExecCall) => Partial<ExecResult> | string | Error | undefined;

export class MockK8s implements K8s {
  readonly namespace = "stepaway-test";
  pods = new Map<string, PodObject>();
  /**
   * PVCs are objects, not names: SPEC-v0.3 parks a `building` session's
   * annotations on the PVC because its pod does not exist yet.
   */
  pvcObjects = new Map<string, PvcObject>();
  jobs = new Map<string, JobObject>();
  secrets = new Map<string, Record<string, string>>();
  podLogsByPod = new Map<string, string>();
  created: { kind: string; yaml: string }[] = [];
  deleted: string[] = [];
  execs: ExecCall[] = [];
  handlers: ExecHandler[] = [];
  storage: StorageClassProbe = { ok: true, forbidden: false, names: ["longhorn"] };
  allow = true;

  constructor(opts: { pods?: PodObject[] } = {}) {
    for (const p of opts.pods ?? []) this.pods.set(p.metadata.name, p);
  }

  on(handler: ExecHandler): this {
    this.handlers.push(handler);
    return this;
  }

  async createFromYaml(kindPlural: "pods" | "persistentvolumeclaims", yaml: string): Promise<void> {
    this.created.push({ kind: kindPlural, yaml });
    if (kindPlural === "persistentvolumeclaims") {
      const pvcName = nameFromYaml(yaml);
      this.pvcObjects.set(pvcName, {
        metadata: {
          name: pvcName,
          labels: labelsFromYaml(yaml),
          annotations: annotationsFromYaml(yaml),
          creationTimestamp: new Date().toISOString(),
        },
      });
      return;
    }
    const name = nameFromYaml(yaml);
    this.pods.set(name, {
      metadata: {
        name,
        labels: labelsFromYaml(yaml),
        annotations: annotationsFromYaml(yaml),
        creationTimestamp: new Date().toISOString(),
      },
      status: { phase: "Pending", conditions: [] },
    });
  }

  async getPod(name: string): Promise<PodObject | null> {
    return this.pods.get(name) ?? null;
  }

  async listPods(labelSelector?: string): Promise<PodObject[]> {
    return [...this.pods.values()].filter((p) => matches(p.metadata.labels, labelSelector));
  }

  async patchPodAnnotations(name: string, annotations: Record<string, string | null>): Promise<void> {
    const pod = this.pods.get(name);
    if (!pod) return;
    pod.metadata.annotations = mergeAnnotations(pod.metadata.annotations, annotations);
  }

  async deletePod(name: string): Promise<void> {
    this.pods.delete(name);
    this.deleted.push(`pod/${name}`);
  }

  async deletePvc(name: string): Promise<void> {
    this.pvcObjects.delete(name);
    this.deleted.push(`pvc/${name}`);
  }

  async getPvc(name: string): Promise<PvcObject | null> {
    return this.pvcObjects.get(name) ?? null;
  }

  async listPvcs(labelSelector?: string): Promise<PvcObject[]> {
    return [...this.pvcObjects.values()].filter((p) => matches(p.metadata.labels, labelSelector));
  }

  async patchPvcAnnotations(name: string, annotations: Record<string, string | null>): Promise<void> {
    const pvc = this.pvcObjects.get(name);
    if (!pvc) return;
    pvc.metadata.annotations = mergeAnnotations(pvc.metadata.annotations, annotations);
  }

  async createJobFromYaml(yaml: string): Promise<void> {
    this.created.push({ kind: "jobs", yaml });
    const name = nameFromYaml(yaml);
    if (this.jobs.has(name)) return; // 409, idempotent by construction
    this.jobs.set(name, {
      metadata: { name, labels: labelsFromYaml(yaml), creationTimestamp: new Date().toISOString() },
      status: { active: 1 },
    });
  }

  async getJob(name: string): Promise<JobObject | null> {
    return this.jobs.get(name) ?? null;
  }

  async listJobs(labelSelector?: string): Promise<JobObject[]> {
    return [...this.jobs.values()].filter((j) => matches(j.metadata.labels, labelSelector));
  }

  async deleteJob(name: string): Promise<void> {
    this.jobs.delete(name);
    this.deleted.push(`job/${name}`);
  }

  async podLogs(name: string): Promise<string> {
    return this.podLogsByPod.get(name) ?? "";
  }

  async getSecret(name: string): Promise<Record<string, string> | null> {
    return this.secrets.get(name) ?? null;
  }

  async applySecret(name: string, data: Record<string, string>): Promise<void> {
    this.secrets.set(name, data);
  }

  async deleteSecret(name: string): Promise<void> {
    this.secrets.delete(name);
    this.deleted.push(`secret/${name}`);
  }

  async listStorageClasses(): Promise<StorageClassProbe> {
    return this.storage;
  }

  async canI(): Promise<boolean> {
    return this.allow;
  }

  async exec(pod: string, command: string[], opts: ExecOpts = {}): Promise<ExecResult> {
    const stdinBytes = await drain(opts.stdin);
    const call: ExecCall = { pod, command, script: command[2] ?? "", stdinBytes, opts };
    this.execs.push(call);
    for (const h of this.handlers) {
      const r = h(call);
      if (r === undefined) continue;
      if (r instanceof Error) throw r;
      if (typeof r === "string") return { code: 0, stdout: r, stderr: "" };
      return { code: 0, stdout: "", stderr: "", ...r };
    }
    return { code: 0, stdout: "", stderr: "" };
  }

  /**
   * Mirrors the real ExecSocket contract: whatever stdout the handler produced
   * is delivered, and then a non-zero exit ERRORS the stream. A clean close on
   * a failed exec is exactly the bug the /archive route had.
   */
  execStream(pod: string, command: string[], opts: ExecOpts = {}): ReadableStream<Uint8Array> {
    const self = this;
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        const r = await self.exec(pod, command, opts);
        if (r.stdout) controller.enqueue(new TextEncoder().encode(r.stdout));
        if (r.code !== 0) {
          controller.error(new Error(`exec exited ${r.code}${r.stderr ? `: ${r.stderr}` : ""}`));
          return;
        }
        // stays open: the follow tests cancel it themselves
        if (!/tail -n \+1 -F/.test(command[2] ?? "")) controller.close();
      },
    });
  }
}

function mergeAnnotations(
  current: Record<string, string> | undefined,
  patch: Record<string, string | null>,
): Record<string, string> {
  const ann = { ...(current ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete ann[k];
    else ann[k] = v;
  }
  return ann;
}

/** `k=v` and bare-`k` (exists) selectors — the only two forms the server uses. */
function matches(labels: Record<string, string> | undefined, selector?: string): boolean {
  if (!selector) return true;
  return selector.split(",").every((term) => {
    const [k, v] = term.split("=");
    const have = labels?.[k.trim()];
    return v === undefined ? have !== undefined : have === v.trim();
  });
}

async function drain(stdin: ExecOpts["stdin"]): Promise<number> {
  if (stdin === undefined) return 0;
  if (typeof stdin === "string") return new TextEncoder().encode(stdin).length;
  if (stdin instanceof Uint8Array) return stdin.length;
  const reader = stdin.getReader();
  let n = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    n += value?.length ?? 0;
  }
  return n;
}

function nameFromYaml(yaml: string): string {
  return yaml.match(/^\s{2}name:\s*(\S+)/m)?.[1] ?? "";
}

function labelsFromYaml(yaml: string): Record<string, string> {
  const block = yaml.split("\n");
  const out: Record<string, string> = {};
  let inLabels = false;
  for (const line of block) {
    if (/^\s{2}labels:/.test(line)) {
      inLabels = true;
      continue;
    }
    if (inLabels) {
      const m = line.match(/^\s{4}([^:\s]+):\s*(.+)$/);
      if (!m) break;
      out[m[1]] = m[2].trim();
    }
  }
  return out;
}

function annotationsFromYaml(yaml: string): Record<string, string> {
  const lines = yaml.split("\n");
  const out: Record<string, string> = {};
  let inAnn = false;
  for (const line of lines) {
    if (/^\s{2}annotations:/.test(line)) {
      inAnn = true;
      continue;
    }
    if (inAnn) {
      const m = line.match(/^\s{4}([^:\s]+):\s*(.+)$/);
      if (!m) break;
      out[m[1]] = JSON.parse(m[2].trim());
    }
  }
  return out;
}

/** A PVC as the API server would report it (the pre-pod home of session state). */
export function fakePvc(o: { name: string; sessionId: string; annotations?: Record<string, string> }): PvcObject {
  return {
    metadata: {
      name: o.name,
      labels: { "stepaway.dev/session": o.sessionId },
      annotations: o.annotations,
      creationTimestamp: "2026-08-24T10:00:00.000Z",
    },
  };
}

/** A pod as the API server would report it once the kubelet has it running. */
export function fakePod(o: {
  name: string;
  sessionId: string;
  annotations?: Record<string, string>;
  ready?: boolean;
  deleting?: boolean;
}): PodObject {
  return {
    metadata: {
      name: o.name,
      labels: { "stepaway.dev/session": o.sessionId },
      annotations: o.annotations,
      creationTimestamp: "2026-08-24T10:00:00.000Z",
      ...(o.deleting ? { deletionTimestamp: "2026-08-24T11:00:00.000Z" } : {}),
    },
    status: {
      phase: "Running",
      conditions: [{ type: "Ready", status: o.ready === false ? "False" : "True" }],
    },
  };
}
