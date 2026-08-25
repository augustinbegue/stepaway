/**
 * Minimal typed Kubernetes client — direct REST/WebSocket against the API
 * server with the pod's ServiceAccount (SPEC-v0.2 §1: "no kubectl binary in
 * the image").
 *
 * Two deliberate choices:
 *   - manifests are POSTed as `application/yaml`, so the podspec/pvc templates
 *     in @stepaway/core travel verbatim and the backend needs no YAML library;
 *   - the SA token is re-read from disk on every request/connection, because
 *     bound ServiceAccount tokens rotate (~hourly) and a cached one 401s.
 *
 * Everything the routes need is behind the `K8s` interface, so tests inject a
 * mock and never touch a cluster.
 */

import { readFile } from "node:fs/promises";

const SA_DIR = "/var/run/secrets/kubernetes.io/serviceaccount";

export type PodObject = {
  metadata: {
    name: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    creationTimestamp?: string;
    deletionTimestamp?: string;
  };
  status?: {
    phase?: string;
    conditions?: { type: string; status: string }[];
  };
};

export type ExecResult = { code: number; stdout: string; stderr: string };

export type ExecOpts = {
  container?: string;
  /** piped into the remote process's stdin, then stdin is closed. */
  stdin?: ReadableStream<Uint8Array> | Uint8Array | string;
  /** hard cap; the connection is torn down when it expires. */
  timeoutMs?: number;
};

export type StorageClassProbe = { ok: boolean; forbidden: boolean; names: string[] };

export interface K8s {
  readonly namespace: string;
  /** apply a core/v1 manifest (YAML). Already-exists is not an error. */
  createFromYaml(kindPlural: "pods" | "persistentvolumeclaims", yaml: string): Promise<void>;
  getPod(name: string): Promise<PodObject | null>;
  listPods(labelSelector?: string): Promise<PodObject[]>;
  /** strategic-merge patch of pod annotations (null value deletes a key). */
  patchPodAnnotations(name: string, annotations: Record<string, string | null>): Promise<void>;
  deletePod(name: string): Promise<void>;
  deletePvc(name: string): Promise<void>;
  getSecret(name: string): Promise<Record<string, string> | null>;
  /** create-or-replace an Opaque Secret from already-base64 data. */
  applySecret(name: string, data: Record<string, string>): Promise<void>;
  listStorageClasses(): Promise<StorageClassProbe>;
  /** SelfSubjectAccessReview; false when the review itself is refused. */
  canI(verb: string, resource: string, subresource?: string): Promise<boolean>;
  exec(pod: string, command: string[], opts?: ExecOpts): Promise<ExecResult>;
  /**
   * stdout of the remote process as a stream; cancelling closes the socket.
   * A non-zero exit (or a missing channel-3 status) errors the stream — the
   * consumer must never mistake a truncated payload for a complete one.
   * `opts.timeoutMs` applies here exactly as it does to exec().
   */
  execStream(pod: string, command: string[], opts?: ExecOpts): ReadableStream<Uint8Array>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`kubernetes API ${status}: ${body.slice(0, 400)}`);
  }
}

export type RestK8sOptions = {
  host?: string;
  port?: string;
  namespace?: string;
  tokenFile?: string;
  caFile?: string;
  namespaceFile?: string;
};

export class RestK8s implements K8s {
  readonly namespace: string;
  private readonly base: string;
  private readonly wsBase: string;
  private readonly tokenFile: string;
  private readonly caFile: string;
  private ca: string | undefined;

  private constructor(o: { base: string; wsBase: string; namespace: string; tokenFile: string; caFile: string }) {
    this.base = o.base;
    this.wsBase = o.wsBase;
    this.namespace = o.namespace;
    this.tokenFile = o.tokenFile;
    this.caFile = o.caFile;
  }

  static async create(o: RestK8sOptions = {}): Promise<RestK8s> {
    const host = o.host ?? process.env.KUBERNETES_SERVICE_HOST;
    const port = o.port ?? process.env.KUBERNETES_SERVICE_PORT ?? "443";
    if (!host) throw new Error("KUBERNETES_SERVICE_HOST is unset — the backend must run inside the cluster");
    const authority = host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`;
    const nsFile = o.namespaceFile ?? `${SA_DIR}/namespace`;
    const namespace = o.namespace ?? (await readFile(nsFile, "utf8")).trim();
    const k = new RestK8s({
      base: `https://${authority}`,
      wsBase: `wss://${authority}`,
      namespace,
      tokenFile: o.tokenFile ?? `${SA_DIR}/token`,
      caFile: o.caFile ?? `${SA_DIR}/ca.crt`,
    });
    try {
      k.ca = await readFile(k.caFile, "utf8");
    } catch {
      k.ca = undefined; // falls back to the system store / NODE_EXTRA_CA_CERTS
    }
    return k;
  }

  /** Bound SA tokens rotate: never cache. */
  private async token(): Promise<string> {
    return (await readFile(this.tokenFile, "utf8")).trim();
  }

  private async req(
    path: string,
    init: { method?: string; body?: string; contentType?: string; accept?: string } = {},
  ): Promise<{ status: number; text: string }> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${await this.token()}`,
      accept: init.accept ?? "application/json",
    };
    if (init.contentType) headers["content-type"] = init.contentType;
    const res = await fetch(`${this.base}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body,
      // Bun-specific: verify against the ServiceAccount CA bundle.
      ...(this.ca ? { tls: { ca: this.ca } } : {}),
    } as RequestInit);
    return { status: res.status, text: await res.text() };
  }

  private async json<T>(path: string, init?: Parameters<RestK8s["req"]>[1]): Promise<T> {
    const r = await this.req(path, init);
    if (r.status >= 400) throw new ApiError(r.status, r.text);
    return JSON.parse(r.text) as T;
  }

  private ns(sub: string): string {
    return `/api/v1/namespaces/${encodeURIComponent(this.namespace)}/${sub}`;
  }

  async createFromYaml(kindPlural: "pods" | "persistentvolumeclaims", yaml: string): Promise<void> {
    const r = await this.req(this.ns(kindPlural), { method: "POST", body: yaml, contentType: "application/yaml" });
    if (r.status === 409) return; // idempotent by construction
    if (r.status >= 400) throw new ApiError(r.status, r.text);
  }

  async getPod(name: string): Promise<PodObject | null> {
    const r = await this.req(this.ns(`pods/${encodeURIComponent(name)}`));
    if (r.status === 404) return null;
    if (r.status >= 400) throw new ApiError(r.status, r.text);
    return JSON.parse(r.text) as PodObject;
  }

  async listPods(labelSelector?: string): Promise<PodObject[]> {
    const q = labelSelector ? `?labelSelector=${encodeURIComponent(labelSelector)}` : "";
    const list = await this.json<{ items: PodObject[] }>(this.ns(`pods${q}`));
    return list.items ?? [];
  }

  async patchPodAnnotations(name: string, annotations: Record<string, string | null>): Promise<void> {
    const r = await this.req(this.ns(`pods/${encodeURIComponent(name)}`), {
      method: "PATCH",
      contentType: "application/merge-patch+json",
      body: JSON.stringify({ metadata: { annotations } }),
    });
    if (r.status === 404) return;
    if (r.status >= 400) throw new ApiError(r.status, r.text);
  }

  async deletePod(name: string): Promise<void> {
    const r = await this.req(this.ns(`pods/${encodeURIComponent(name)}`), { method: "DELETE" });
    if (r.status !== 404 && r.status >= 400) throw new ApiError(r.status, r.text);
  }

  async deletePvc(name: string): Promise<void> {
    const r = await this.req(this.ns(`persistentvolumeclaims/${encodeURIComponent(name)}`), { method: "DELETE" });
    if (r.status !== 404 && r.status >= 400) throw new ApiError(r.status, r.text);
  }

  async getSecret(name: string): Promise<Record<string, string> | null> {
    const r = await this.req(this.ns(`secrets/${encodeURIComponent(name)}`));
    if (r.status === 404) return null;
    if (r.status >= 400) throw new ApiError(r.status, r.text);
    return (JSON.parse(r.text).data ?? {}) as Record<string, string>;
  }

  async applySecret(name: string, data: Record<string, string>): Promise<void> {
    const body = JSON.stringify({
      apiVersion: "v1",
      kind: "Secret",
      metadata: { name },
      type: "Opaque",
      data,
    });
    const post = await this.req(this.ns("secrets"), { method: "POST", body, contentType: "application/json" });
    if (post.status < 400) return;
    if (post.status !== 409) throw new ApiError(post.status, post.text);
    const put = await this.req(this.ns(`secrets/${encodeURIComponent(name)}`), {
      method: "PUT",
      body,
      contentType: "application/json",
    });
    if (put.status >= 400) throw new ApiError(put.status, put.text);
  }

  async listStorageClasses(): Promise<StorageClassProbe> {
    // Cluster-scoped: the chart's Role is namespace-scoped, so 403 is the
    // normal, expected answer (§2). Callers downgrade it to a warning.
    const r = await this.req("/apis/storage.k8s.io/v1/storageclasses");
    if (r.status === 403) return { ok: false, forbidden: true, names: [] };
    if (r.status >= 400) return { ok: false, forbidden: false, names: [] };
    const items = (JSON.parse(r.text).items ?? []) as { metadata: { name: string } }[];
    return { ok: true, forbidden: false, names: items.map((i) => i.metadata.name) };
  }

  async canI(verb: string, resource: string, subresource?: string): Promise<boolean> {
    try {
      const body = JSON.stringify({
        apiVersion: "authorization.k8s.io/v1",
        kind: "SelfSubjectAccessReview",
        spec: { resourceAttributes: { namespace: this.namespace, verb, resource, subresource } },
      });
      const res = await this.json<{ status?: { allowed?: boolean } }>(
        "/apis/authorization.k8s.io/v1/selfsubjectaccessreviews",
        { method: "POST", body, contentType: "application/json" },
      );
      return res.status?.allowed === true;
    } catch {
      return false;
    }
  }

  private async execUrl(pod: string, command: string[], opts: ExecOpts): Promise<string> {
    const q = new URLSearchParams();
    for (const c of command) q.append("command", c);
    q.append("container", opts.container ?? "runner");
    q.append("stdout", "true");
    q.append("stderr", "true");
    if (opts.stdin !== undefined) q.append("stdin", "true");
    return `${this.wsBase}/api/v1/namespaces/${encodeURIComponent(this.namespace)}/pods/${encodeURIComponent(pod)}/exec?${q}`;
  }

  private async openExec(pod: string, command: string[], opts: ExecOpts): Promise<ExecSocket> {
    const url = await this.execUrl(pod, command, opts);
    const ws = new (WebSocket as any)(url, {
      protocols: [PROTO_V5, PROTO_V4],
      headers: { authorization: `Bearer ${await this.token()}` },
      ...(this.ca ? { tls: { ca: this.ca } } : {}),
    }) as WebSocket;
    ws.binaryType = "arraybuffer";
    return new ExecSocket(ws, opts);
  }

  async exec(pod: string, command: string[], opts: ExecOpts = {}): Promise<ExecResult> {
    const sock = await this.openExec(pod, command, opts);
    return sock.collect();
  }

  execStream(pod: string, command: string[], opts: ExecOpts = {}): ReadableStream<Uint8Array> {
    let sock: ExecSocket | null = null;
    return new ReadableStream<Uint8Array>({
      start: async (controller) => {
        try {
          sock = await this.openExec(pod, command, opts);
          sock.pipeStdout(controller);
        } catch (e) {
          controller.error(e);
        }
      },
      cancel: () => sock?.cancel(),
    });
  }
}

const PROTO_V5 = "v5.channel.k8s.io";
const PROTO_V4 = "v4.channel.k8s.io";

const CH_STDIN = 0;
const CH_STDOUT = 1;
const CH_STDERR = 2;
const CH_ERROR = 3;
/** v5 only: {255, streamId} closes one stream (we use it for stdin EOF). */
const CH_CLOSE = 255;

/** Hot path: one encoder/decoder for the process, not one per frame. */
const ENC = new TextEncoder();
const DEC = new TextDecoder();

/** Where a dispatched frame's bytes go. stderr/status default to accumulators. */
type FrameSinks = {
  onStdout: (payload: Uint8Array) => void;
  /** end of the socket: `err` set = the exec did not complete cleanly. */
  onEnd: (err: Error | null) => void;
};

/**
 * One exec WebSocket, in the k8s channel framing: every frame is
 * `[channel byte, ...payload]`. Channel 3 carries a metav1.Status JSON at the
 * end, which is where the remote exit code lives.
 */
export class ExecSocket {
  private stdoutChunks: Uint8Array[] = [];
  private stderrText = "";
  private statusText = "";
  private closed = false;
  private cancelled = false;

  constructor(
    private readonly ws: WebSocket,
    private readonly opts: ExecOpts,
  ) {}

  /** Consumer went away: tear down without turning it into an error. */
  cancel(): void {
    this.cancelled = true;
    this.close();
  }

  close(): void {
    this.closed = true;
    try {
      this.ws.close();
    } catch {
      /* already gone */
    }
  }

  private frame(data: ArrayBuffer | string): { ch: number; payload: Uint8Array } | null {
    if (typeof data === "string") {
      const bytes = ENC.encode(data);
      return bytes.length ? { ch: bytes[0], payload: bytes.subarray(1) } : null;
    }
    const bytes = new Uint8Array(data);
    return bytes.length ? { ch: bytes[0], payload: bytes.subarray(1) } : null;
  }

  /**
   * Exit code from the channel-3 metav1.Status. The API server ALWAYS sends a
   * status frame (even on success), so an absent one means the transport
   * failed — report loudly instead of a phantom success. (Seen live: Bun
   * 1.4.0's WebSocket silently dropped every frame; exec looked like exit 0
   * with empty output and corrupted the whole capture flow.)
   */
  private exitCode(): number {
    if (!this.statusText.trim()) return 255;
    try {
      const st = JSON.parse(this.statusText);
      if (st.status === "Success") return 0;
      const cause = (st.details?.causes ?? []).find((c: any) => c.reason === "ExitCode");
      if (cause) return Number(cause.message) || 1;
      return 1;
    } catch {
      return 255;
    }
  }

  /**
   * Non-null when the exec did NOT complete successfully — the one place both
   * the buffered and the streaming path ask "was this a real success?".
   * An absent status frame counts as a failure for the same reason exitCode()
   * returns 255 for it: no status means the transport, not the command, ended.
   */
  private failure(): Error | null {
    if (!this.statusText.trim()) {
      return new Error("exec ended without a status frame — the connection dropped mid-stream");
    }
    const code = this.exitCode();
    if (code === 0) return null;
    const why = this.stderrText.trim().split("\n").filter(Boolean).pop();
    return new Error(`exec exited ${code}${why ? `: ${why}` : ""}`);
  }

  /**
   * The single frame-dispatch loop. stderr and the channel-3 status are always
   * accumulated on the instance; only stdout is pluggable, which is the entire
   * difference between collect() and pipeStdout(). timeoutMs is enforced here,
   * so it works on both paths.
   */
  private dispatch(sinks: FrameSinks): void {
    let ended = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const end = (err: Error | null) => {
      if (ended) return;
      ended = true;
      if (timer) clearTimeout(timer);
      sinks.onEnd(err);
    };

    if (this.opts.timeoutMs) {
      timer = setTimeout(() => {
        this.close();
        end(new Error(`exec timed out after ${this.opts.timeoutMs}ms`));
      }, this.opts.timeoutMs);
    }

    this.ws.onopen = () => {
      this.pumpStdin().catch((e) => {
        this.close();
        end(e as Error);
      });
    };
    this.ws.onmessage = (ev: MessageEvent) => {
      const f = this.frame(ev.data as ArrayBuffer | string);
      if (!f) return;
      if (f.ch === CH_STDOUT) sinks.onStdout(f.payload);
      else if (f.ch === CH_STDERR) this.stderrText += DEC.decode(f.payload);
      else if (f.ch === CH_ERROR) this.statusText += DEC.decode(f.payload);
    };
    this.ws.onerror = () => {
      /* close always follows; the status decides the outcome */
    };
    this.ws.onclose = () => end(null);
  }

  private async pumpStdin(): Promise<void> {
    const src = this.opts.stdin;
    if (src === undefined) return;
    const send = (chunk: Uint8Array) => {
      const frame = new Uint8Array(chunk.length + 1);
      frame[0] = CH_STDIN;
      frame.set(chunk, 1);
      this.ws.send(frame);
    };
    const backpressure = async () => {
      // 8 MB in flight is plenty; above that we let the socket drain.
      while (!this.closed && (this.ws as any).bufferedAmount > 8 * 1024 * 1024) {
        await new Promise((r) => setTimeout(r, 10));
      }
    };
    if (typeof src === "string") send(ENC.encode(src));
    else if (src instanceof Uint8Array) send(src);
    else {
      const reader = src.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.length) {
          send(value);
          await backpressure();
        }
      }
    }
    if (this.ws.protocol === PROTO_V5) {
      // stdin EOF without tearing the connection down, so the exit status of
      // e.g. `tar -xz` still comes back on channel 3.
      this.ws.send(new Uint8Array([CH_CLOSE, CH_STDIN]));
    } else {
      // v4 has no half-close: the remote sees EOF only when we hang up, and the
      // status frame is lost with it.
      this.close();
    }
  }

  /** Buffered: the exit code is data, so a non-zero one resolves, not rejects. */
  collect(): Promise<ExecResult> {
    return new Promise<ExecResult>((resolve, reject) => {
      this.dispatch({
        onStdout: (p) => this.stdoutChunks.push(p),
        onEnd: (err) => {
          if (err) return reject(err);
          resolve({ code: this.exitCode(), stdout: DEC.decode(concat(this.stdoutChunks)), stderr: this.stderrText });
        },
      });
    });
  }

  /**
   * Streaming: the consumer sees bytes as they arrive, so a failure can only be
   * signalled by erroring the stream. Closing it cleanly on a non-zero exit (or
   * on a missing status frame) is what turned a half-written `tar` into a
   * perfectly valid-looking 200 — never do that.
   */
  pipeStdout(controller: ReadableStreamDefaultController<Uint8Array>): void {
    this.dispatch({
      onStdout: (payload) => {
        if (!payload.length) return;
        try {
          controller.enqueue(payload);
        } catch {
          this.cancel(); // the consumer already went away
        }
      },
      onEnd: (err) => {
        const problem = this.cancelled ? null : (err ?? this.failure());
        try {
          if (problem) controller.error(problem);
          else controller.close();
        } catch {
          /* already closed or errored by a cancel */
        }
      },
    });
  }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const c of chunks) n += c.length;
  const out = new Uint8Array(n);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
