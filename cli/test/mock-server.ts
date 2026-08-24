/**
 * A throwaway mock of the frozen v1 API (packages/core/src/api.ts), used by
 * test/e2e-mock.ts to drive the real CLI end to end with no cluster.
 *
 * It implements the shapes only — no k8s, no pods. The capture upload is
 * retained in memory and served straight back as the pull archive, so a
 * push→pull round trip is a genuine byte-for-byte test of both stream paths.
 */
import { ROUTES, type CaptureReport, type Session } from "@stepaway/core";

export type Call = { method: string; path: string; query: Record<string, string>; bytes?: number; body?: any };

export type Mock = {
  port: number;
  url: string;
  calls: Call[];
  sessions: Map<string, Session>;
  captures: Map<string, Uint8Array>;
  claudeToken: string | null;
  transcript: string;
  stop(): void;
};

const TOKEN = "t";

export function startMock(o: { version?: string; transcript?: string; readyAfter?: number } = {}): Promise<Mock> {
  const version = o.version ?? "0.3.0";
  const calls: Call[] = [];
  const sessions = new Map<string, Session>();
  const captures = new Map<string, Uint8Array>();
  const polls = new Map<string, number>();
  const readyAfter = o.readyAfter ?? 1;
  const state: { claudeToken: string | null } = { claudeToken: null };
  const transcript =
    o.transcript ??
    [
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Picking up where you left off." }] } }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Bash", input: { command: "bun test" } }] },
      }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Tests pass." }] } }),
    ].join("\n");

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const err = (status: number, error: string, detail?: string) => json({ error, detail }, status);

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const u = new URL(req.url);
      const p = u.pathname;
      const query = Object.fromEntries(u.searchParams.entries());
      const auth = req.headers.get("authorization");
      if (p !== ROUTES.healthz && auth !== `Bearer ${TOKEN}`) {
        calls.push({ method: req.method, path: p, query });
        return err(401, "unauthorized", "missing or wrong bearer token");
      }

      // ---- meta
      if (p === ROUTES.healthz) return json({ ok: true });
      if (p === ROUTES.version) {
        calls.push({ method: req.method, path: p, query });
        return json({ version, api: "v1" });
      }
      if (p === ROUTES.diagnostics) {
        calls.push({ method: req.method, path: p, query });
        return json({
          ok: true,
          checks: [
            { name: "rbac", ok: true, level: "pass", detail: "pods, pvcs, secrets: ok" },
            { name: "claude-token", ok: state.claudeToken !== null, level: state.claudeToken ? "pass" : "fail", detail: state.claudeToken ? "present" : "missing" },
            { name: "dind", ok: true, level: "warn", detail: "not probed in the mock" },
          ],
        });
      }
      if (p === ROUTES.claudeToken && req.method === "PUT") {
        const body = await req.json();
        state.claudeToken = String((body as any).token ?? "");
        calls.push({ method: "PUT", path: p, query, body: { token: "<redacted>" } });
        return json({ ok: true });
      }

      // ---- sessions
      if (p === ROUTES.sessions) {
        if (req.method === "POST") {
          const body: any = await req.json();
          const s: Session = {
            id: body.sessionId,
            project: body.project,
            state: "pending",
            podName: `stepaway-${String(body.sessionId).slice(0, 8)}`,
            createdAt: new Date().toISOString(),
          };
          sessions.set(s.id, s);
          calls.push({ method: "POST", path: p, query, body });
          return json(s, 201);
        }
        calls.push({ method: req.method, path: p, query });
        return json([...sessions.values()]);
      }

      const m = /^\/v1\/sessions\/([^/]+)(\/.*)?$/.exec(p);
      if (m) {
        const id = m[1];
        const sub = m[2] ?? "";
        const s = sessions.get(id);
        if (!s && !(sub === "" && req.method === "DELETE")) return err(404, "no such session", id);

        if (sub === "" && req.method === "GET") {
          const n = (polls.get(id) ?? 0) + 1;
          polls.set(id, n);
          if (s!.state === "pending" && n >= readyAfter) s!.state = "ready";
          calls.push({ method: "GET", path: p, query });
          return json(s);
        }
        if (sub === "" && req.method === "DELETE") {
          sessions.delete(id);
          captures.delete(id);
          calls.push({ method: "DELETE", path: p, query });
          return new Response(null, { status: 204 });
        }
        if (sub === "/env-names") {
          calls.push({ method: "GET", path: p, query });
          // the mock runner satisfies everything it is asked about (names only,
          // both directions — values never cross the wire)
          const names = (query.names ?? "").split(",").map((n) => n.trim()).filter(Boolean);
          return json({ satisfied: names });
        }
        if (sub === "/capture" && req.method === "POST") {
          const buf = new Uint8Array(await req.arrayBuffer());
          captures.set(id, buf);
          calls.push({ method: "POST", path: p, query, bytes: buf.byteLength });
          s!.state = "ready";
          const report: CaptureReport = {
            restored: true,
            gitDir: `/repo/${s!.project}.git`,
            workTree: `/work/${s!.project}`,
            branch: "main",
            docker: { attempted: false, ok: true },
            setup: { attempted: Boolean(query.setup), ok: true, cmd: query.setup, tail: "" },
          };
          return json(report);
        }
        if (sub === "/run" && req.method === "POST") {
          const body = await req.json();
          calls.push({ method: "POST", path: p, query, body });
          s!.state = "running";
          return json({ ...s });
        }
        if (sub === "/transcript") {
          calls.push({ method: "GET", path: p, query });
          if (query.follow === "1") {
            const lines = transcript.split("\n");
            const stream = new ReadableStream({
              async start(c) {
                const enc = new TextEncoder();
                for (const l of lines) {
                  c.enqueue(enc.encode(`data: ${l}\n\n`));
                  await new Promise((r) => setTimeout(r, 5));
                }
                c.close();
              },
            });
            return new Response(stream, { headers: { "content-type": "text/event-stream" } });
          }
          return new Response(transcript, { headers: { "content-type": "application/jsonl" } });
        }
        if (sub === "/archive" && req.method === "GET") {
          const tar = captures.get(id);
          calls.push({ method: "GET", path: p, query, bytes: tar?.byteLength ?? 0 });
          if (!tar) return err(404, "no archive", "nothing was ever captured for this session");
          return new Response(tar, { headers: { "content-type": "application/gzip" } });
        }
      }
      calls.push({ method: req.method, path: p, query });
      return err(404, "not found", p);
    },
  });

  return Promise.resolve({
    port: server.port,
    url: `http://127.0.0.1:${server.port}`,
    calls,
    sessions,
    captures,
    get claudeToken() {
      return state.claudeToken;
    },
    transcript,
    stop: () => server.stop(true),
  } as Mock);
}
