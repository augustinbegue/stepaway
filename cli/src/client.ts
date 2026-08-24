import * as fs from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  ROUTES,
  type CaptureReport,
  type CreateSessionRequest,
  type DiagnosticsResponse,
  type EnvNamesResponse,
  type RunRequest,
  type Session,
  type VersionResponse,
} from "@stepaway/core";
import { VERSION } from "./version.js";

/**
 * The whole cluster-facing surface of the CLI: a typed fetch client for the
 * frozen v1 API (packages/core/src/api.ts). Nothing else in this codebase
 * talks to the network, and nothing anywhere talks to kubectl.
 *
 * Zero runtime dependencies — fetch, ReadableStream and SSE parsing are all
 * Node >= 20 built-ins.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: string,
    readonly url?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** JSON `{error, detail}` if the server sent one, else the status line. */
async function toApiError(res: Response, url: string): Promise<ApiError> {
  let error = `HTTP ${res.status} ${res.statusText || ""}`.trim();
  let detail: string | undefined;
  const body = await res.text().catch(() => "");
  if (body) {
    try {
      const j = JSON.parse(body);
      if (j && typeof j === "object") {
        if (typeof j.error === "string") error = j.error;
        if (typeof j.detail === "string") detail = j.detail;
      } else detail = body.slice(0, 400);
    } catch {
      detail = body.trim().split("\n").slice(0, 3).join("\n").slice(0, 400);
    }
  }
  if (res.status === 401 || res.status === 403) {
    detail = (detail ? detail + " — " : "") + "check the bearer token: stepaway auth --server-token <token>";
  }
  return new ApiError(error, res.status, detail, url);
}

export type SkewVerdict = { ok: boolean; fatal: boolean; message: string | null; server: string };

/** spec §5: warn on a minor mismatch, refuse on a major one. */
export function versionSkew(cli: string, server: string): SkewVerdict {
  const part = (v: string) => v.split("-")[0].split(".").map((n) => Number(n) || 0);
  const [cMaj = 0, cMin = 0] = part(cli);
  const [sMaj = 0, sMin = 0] = part(server);
  if (cMaj !== sMaj) {
    return {
      ok: false,
      fatal: true,
      server,
      message:
        `incompatible versions: CLI ${cli}, backend ${server}. ` +
        `Upgrade the one that is behind (npm i -g https://stepaway.dev/stepaway.tgz, or helm upgrade).`,
    };
  }
  if (cMin !== sMin) {
    return {
      ok: true,
      fatal: false,
      server,
      message: `version skew: CLI ${cli}, backend ${server} — same major, some features may differ.`,
    };
  }
  return { ok: true, fatal: false, server, message: null };
}

export class Client {
  readonly server: string;
  private readonly token: string;

  constructor(o: { server: string; token: string }) {
    this.server = o.server.replace(/\/+$/, "");
    this.token = o.token;
  }

  private url(route: string): string {
    return `${this.server}${route}`;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, ...extra };
  }

  /** One request; throws ApiError on any non-2xx. */
  private async fetch(route: string, init: RequestInit & { query?: Record<string, string> } = {}): Promise<Response> {
    let url = this.url(route);
    if (init.query) {
      const q = new URLSearchParams(init.query).toString();
      if (q) url += `?${q}`;
    }
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers: this.headers(init.headers as Record<string, string>) });
    } catch (e) {
      const cause = (e as any)?.cause?.code ?? (e as Error).message;
      throw new ApiError(`cannot reach ${this.server}`, 0, String(cause), url);
    }
    if (!res.ok) throw await toApiError(res, url);
    return res;
  }

  private async json<T>(route: string, init: RequestInit & { query?: Record<string, string> } = {}): Promise<T> {
    const res = await this.fetch(route, init);
    const text = await res.text();
    if (!text.trim()) return undefined as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(`backend returned non-JSON on ${route}`, res.status, text.slice(0, 200), this.url(route));
    }
  }

  private jsonBody(body: unknown): RequestInit {
    return { body: JSON.stringify(body), headers: { "content-type": "application/json" } };
  }

  // ------------------------------------------------------------- meta

  version(): Promise<VersionResponse> {
    return this.json<VersionResponse>(ROUTES.version);
  }

  /** Authenticated ping + version check in one call (what `auth` verifies with). */
  async checkVersion(): Promise<SkewVerdict> {
    const v = await this.version();
    return versionSkew(VERSION, v?.version ?? "0.0.0");
  }

  diagnostics(): Promise<DiagnosticsResponse> {
    return this.json<DiagnosticsResponse>(ROUTES.diagnostics);
  }

  async healthz(): Promise<boolean> {
    try {
      await this.fetch(ROUTES.healthz);
      return true;
    } catch {
      return false;
    }
  }

  putClaudeToken(token: string): Promise<void> {
    return this.json<void>(ROUTES.claudeToken, { method: "PUT", ...this.jsonBody({ token }) });
  }

  // ------------------------------------------------------------- sessions

  createSession(req: CreateSessionRequest): Promise<Session> {
    return this.json<Session>(ROUTES.sessions, { method: "POST", ...this.jsonBody(req) });
  }

  /** Tolerates both `[...]` and `{sessions:[...]}` — see NOTES in README. */
  async listSessions(): Promise<Session[]> {
    const r = await this.json<Session[] | { sessions: Session[] }>(ROUTES.sessions);
    if (Array.isArray(r)) return r;
    if (r && Array.isArray((r as any).sessions)) return (r as any).sessions;
    return [];
  }

  getSession(id: string): Promise<Session> {
    return this.json<Session>(ROUTES.session(id));
  }

  async deleteSession(id: string): Promise<void> {
    await this.json<void>(ROUTES.session(id), { method: "DELETE" });
  }

  run(id: string, req: RunRequest): Promise<Session | void> {
    return this.json<Session | void>(ROUTES.run(id), { method: "POST", ...this.jsonBody(req) });
  }

  async envNames(id: string, names: string[]): Promise<Set<string>> {
    if (!names.length) return new Set();
    const r = await this.json<EnvNamesResponse>(ROUTES.envNames(id), { query: { names: names.join(",") } });
    return new Set(Array.isArray(r?.satisfied) ? r.satisfied : []);
  }

  /**
   * Poll `GET /sessions/:id` until the state leaves `pending`. This is the
   * backend's absorbed waitRunner (spec §3): claude-version polling on the
   * runner is the pending → ready edge, and we only see the edge.
   */
  async waitReady(
    id: string,
    o: { timeoutMs?: number; onState?: (s: Session) => void; intervalMs?: number } = {},
  ): Promise<Session> {
    const deadline = Date.now() + (o.timeoutMs ?? 300_000);
    for (;;) {
      const s = await this.getSession(id);
      o.onState?.(s);
      if (s.state === "failed") {
        throw new ApiError(`session ${id} failed`, 0, s.detail ?? "no detail from the backend");
      }
      if (s.state !== "pending") return s;
      if (Date.now() > deadline) {
        throw new ApiError(
          `runner ${s.podName || id} still pending after ${Math.round((o.timeoutMs ?? 300_000) / 1000)}s`,
          0,
          "check the backend: stepaway doctor",
        );
      }
      await sleep(o.intervalMs ?? 2000);
    }
  }

  // ------------------------------------------------------------- streams

  /**
   * Stream a local tar straight into `POST /capture` — no buffering, no
   * staging. Node's fetch requires `duplex: "half"` for a streaming body.
   */
  async uploadCapture(id: string, tarPath: string, setup: string | null): Promise<CaptureReport> {
    const size = fs.statSync(tarPath).size;
    const web = Readable.toWeb(fs.createReadStream(tarPath)) as unknown as ReadableStream;
    const res = await this.fetch(ROUTES.capture(id), {
      method: "POST",
      query: setup ? { setup } : undefined,
      headers: { "content-type": "application/gzip", "content-length": String(size) },
      body: web,
      // required by undici for a streaming request body
      duplex: "half",
    });
    const text = await res.text();
    if (!text.trim()) return emptyReport();
    try {
      return JSON.parse(text) as CaptureReport;
    } catch {
      throw new ApiError("backend returned non-JSON from /capture", res.status, text.slice(0, 200));
    }
  }

  /** `GET /archive` → a local file, streamed. */
  async downloadArchive(id: string, destPath: string): Promise<number> {
    const res = await this.fetch(ROUTES.archive(id));
    if (!res.body) throw new ApiError("backend sent an empty archive", res.status);
    const out = fs.createWriteStream(destPath);
    await pipeline(Readable.fromWeb(res.body as any), out);
    return fs.statSync(destPath).size;
  }

  /** Whole transcript so far, as raw JSONL. */
  async transcript(id: string): Promise<string> {
    const res = await this.fetch(ROUTES.transcript(id));
    return res.text();
  }

  /**
   * `GET /transcript?follow=1` as SSE. Events are separated by a blank line;
   * every `data:` line of an event is one transcript JSONL line.
   */
  async followTranscript(
    id: string,
    onLine: (line: string) => void,
    o: { signal?: AbortSignal } = {},
  ): Promise<void> {
    const res = await this.fetch(ROUTES.transcript(id), {
      query: { follow: "1" },
      headers: { accept: "text/event-stream" },
      signal: o.signal,
    });
    if (!res.body) return;
    const dec = new TextDecoder();
    let buf = "";
    const flushEvent = (chunk: string) => {
      for (const raw of chunk.split("\n")) {
        const line = raw.replace(/\r$/, "");
        if (!line.startsWith("data:")) continue; // ignore id:/event:/: comments
        const payload = line.slice(5).replace(/^ /, "");
        if (payload) onLine(payload);
      }
    };
    try {
      for await (const chunk of res.body) {
        buf += dec.decode(chunk as Uint8Array, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) !== -1) {
          flushEvent(buf.slice(0, i));
          buf = buf.slice(i + 2);
        }
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      throw e;
    }
    if (buf.trim()) flushEvent(buf);
  }
}

function emptyReport(): CaptureReport {
  return {
    restored: true,
    gitDir: "",
    workTree: "",
    branch: "",
    docker: { attempted: false, ok: true },
    setup: { attempted: false, ok: true },
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
