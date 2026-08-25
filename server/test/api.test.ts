/**
 * Route-level tests: the real Hono app, the real core scripts, a mock cluster.
 * Everything asserted here is a clause of the frozen contract (api.ts) or of
 * SPEC-v0.2 §3 — if one of these fails, the CLI is already broken.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  AUTH_SECRET,
  AUTH_SECRET_KEY,
  ROUTES,
  SESSION_LABEL,
  podName,
  slugFor,
  type CaptureReport,
  type DiagnosticsResponse,
  type EnvNamesResponse,
  type Manifest,
  type Session,
  type VersionResponse,
} from "@stepaway/core";
import { createApp, launchScript, transcriptPath } from "../src/app.js";
import { VERSION, loadConfig } from "../src/config.js";
import { ANN } from "../src/sessions.js";
import { MockK8s, fakePod, fakePvc } from "./mock-k8s.js";

const TOKEN = "test-token-0123456789";
const SID = "0ea9f8b7-1111-2222-3333-444455556666";
const POD = podName(SID);

function app(k8s: MockK8s) {
  return createApp({ k8s, config: { ...loadConfig({}), token: TOKEN } });
}

function req(path: string, init: RequestInit & { token?: string | null } = {}): Request {
  const { token, ...rest } = init;
  const headers = new Headers(rest.headers);
  const t = token === undefined ? TOKEN : token;
  if (t) headers.set("authorization", `Bearer ${t}`);
  return new Request(`http://backend${path}`, { ...rest, headers });
}

const ready = (annotations: Record<string, string>) => fakePod({ name: POD, sessionId: SID, annotations });

const BASE_ANN = {
  [ANN.project]: "car-mod-viz",
  [ANN.createdAt]: "2026-08-24T10:00:00.000Z",
  [ANN.remoteBase]: "/work",
};

describe("auth middleware", () => {
  test("healthz is open", async () => {
    const res = await app(new MockK8s()).fetch(req(ROUTES.healthz, { token: null }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("401 without a token", async () => {
    const res = await app(new MockK8s()).fetch(req(ROUTES.sessions, { token: null }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthorized");
  });

  test("401 with the wrong token", async () => {
    const res = await app(new MockK8s()).fetch(req(ROUTES.sessions, { token: "nope" }));
    expect(res.status).toBe(401);
  });

  test("401 with a prefix of the right token (no early-exit compare)", async () => {
    const res = await app(new MockK8s()).fetch(req(ROUTES.sessions, { token: TOKEN.slice(0, -1) }));
    expect(res.status).toBe(401);
  });

  test("200 with the right token", async () => {
    const res = await app(new MockK8s()).fetch(req(ROUTES.sessions));
    expect(res.status).toBe(200);
  });

  test("503 when the server has no token configured", async () => {
    const bare = createApp({ k8s: new MockK8s(), config: { ...loadConfig({}), token: "" } });
    expect((await bare.fetch(req(ROUTES.sessions))).status).toBe(503);
    expect((await bare.fetch(req(ROUTES.healthz, { token: null }))).status).toBe(200);
  });
});

describe("version", () => {
  test("matches api.ts VersionResponse and package.json", async () => {
    const res = await app(new MockK8s()).fetch(req(ROUTES.version));
    const body = (await res.json()) as VersionResponse;
    expect(body.api).toBe("v1");
    expect(body.version).toBe(VERSION);
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(body.version).toBe(pkg.version);
    expect(Object.keys(body).sort()).toEqual(["api", "version"]);
  });
});

describe("sessions", () => {
  test("create makes a PVC and a pod, labelled and annotated", async () => {
    const k8s = new MockK8s();
    const res = await app(k8s).fetch(
      req(ROUTES.sessions, { method: "POST", body: JSON.stringify({ sessionId: SID, project: "car-mod-viz" }) }),
    );
    expect(res.status).toBe(201);
    const s = (await res.json()) as Session;
    expect(s).toMatchObject({ id: SID, project: "car-mod-viz", state: "pending", podName: POD });
    expect(new Date(s.createdAt).toString()).not.toBe("Invalid Date");

    expect(k8s.created.map((x) => x.kind)).toEqual(["persistentvolumeclaims", "pods"]);
    const pod = k8s.pods.get(POD)!;
    expect(pod.metadata.labels?.[SESSION_LABEL]).toBe(SID);
    expect(pod.metadata.annotations?.[ANN.project]).toBe("car-mod-viz");
    expect(pod.metadata.annotations?.[ANN.state]).toBe("pending");
    expect(k8s.created[1].yaml).toContain(`name: ${AUTH_SECRET}`);
  });

  test("create is idempotent per sessionId, and 409s on a different project", async () => {
    const k8s = new MockK8s({ pods: [ready({ ...BASE_ANN, [ANN.state]: "ready" })] });
    const same = await app(k8s).fetch(
      req(ROUTES.sessions, { method: "POST", body: JSON.stringify({ sessionId: SID, project: "car-mod-viz" }) }),
    );
    expect(same.status).toBe(200);
    expect(((await same.json()) as Session).state).toBe("ready");
    expect(k8s.created).toHaveLength(0);

    const other = await app(k8s).fetch(
      req(ROUTES.sessions, { method: "POST", body: JSON.stringify({ sessionId: SID, project: "something-else" }) }),
    );
    expect(other.status).toBe(409);
  });

  test("bad bodies are rejected before anything is created", async () => {
    const k8s = new MockK8s();
    const a = app(k8s);
    expect((await a.fetch(req(ROUTES.sessions, { method: "POST", body: "{" }))).status).toBe(400);
    expect((await a.fetch(req(ROUTES.sessions, { method: "POST", body: "{}" }))).status).toBe(400);
    const traversal = await a.fetch(
      req(ROUTES.sessions, { method: "POST", body: JSON.stringify({ sessionId: SID, project: "../etc" }) }),
    );
    expect(traversal.status).toBe(400);
    expect(k8s.created).toHaveLength(0);
  });

  test("list and detail read the annotations back", async () => {
    const k8s = new MockK8s({ pods: [ready({ ...BASE_ANN, [ANN.state]: "ready" })] });
    const list = (await (await app(k8s).fetch(req(ROUTES.sessions))).json()) as Session[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: SID, project: "car-mod-viz", state: "ready", podName: POD });

    const one = (await (await app(k8s).fetch(req(ROUTES.session(SID)))).json()) as Session;
    expect(one.id).toBe(SID);
    const missing = await app(new MockK8s()).fetch(req(ROUTES.session(SID)));
    expect(missing.status).toBe(404);
  });

  test("list answers from annotations only — no exec per pod", async () => {
    const k8s = new MockK8s({ pods: [ready({ ...BASE_ANN, [ANN.state]: "running" })] });
    const list = (await (await app(k8s).fetch(req(ROUTES.sessions))).json()) as Session[];
    expect(list[0].state).toBe("running");
    expect(k8s.execs).toHaveLength(0);

    // the detail route is the one that derives
    k8s.on((c) => (c.script.includes("exit-code") ? "0\n" : undefined));
    const one = (await (await app(k8s).fetch(req(ROUTES.session(SID)))).json()) as Session;
    expect(one.state).toBe("done");
  });

  test("delete removes pod and PVC", async () => {
    const k8s = new MockK8s({ pods: [ready({ ...BASE_ANN, [ANN.state]: "ready" })] });
    k8s.pvcObjects.set(POD, fakePvc({ name: POD, sessionId: SID }));
    const res = await app(k8s).fetch(req(ROUTES.session(SID), { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(k8s.deleted).toEqual([`pod/${POD}`, `pvc/${POD}`]);
    expect((await app(k8s).fetch(req(ROUTES.session(SID), { method: "DELETE" }))).status).toBe(404);
  });
});

describe("state derivation", () => {
  test("pending becomes ready when claude answers, and the pod records it", async () => {
    const k8s = new MockK8s({ pods: [ready({ ...BASE_ANN, [ANN.state]: "pending" })] });
    k8s.on((c) => (c.script.includes("claude --version") ? { code: 0, stdout: "1.2.3\n" } : undefined));
    const s = (await (await app(k8s).fetch(req(ROUTES.session(SID)))).json()) as Session;
    expect(s.state).toBe("ready");
    expect(k8s.pods.get(POD)!.metadata.annotations?.[ANN.state]).toBe("ready");
  });

  test("pending stays pending while claude is still installing", async () => {
    const k8s = new MockK8s({ pods: [ready({ ...BASE_ANN, [ANN.state]: "pending" })] });
    k8s.on((c) => (c.script.includes("claude --version") ? { code: 127, stderr: "not found" } : undefined));
    const s = (await (await app(k8s).fetch(req(ROUTES.session(SID)))).json()) as Session;
    expect(s.state).toBe("pending");
  });

  test("running + exit marker 0 -> done", async () => {
    const k8s = new MockK8s({ pods: [ready({ ...BASE_ANN, [ANN.state]: "running" })] });
    k8s.on((c) => (c.script.includes("exit-code") ? "0\n" : undefined));
    const s = (await (await app(k8s).fetch(req(ROUTES.session(SID)))).json()) as Session;
    expect(s.state).toBe("done");
    expect(s.exitCode).toBe(0);
    expect(k8s.pods.get(POD)!.metadata.annotations?.[ANN.exitCode]).toBe("0");
  });

  test("running + exit marker 2 -> failed, with a detail", async () => {
    const k8s = new MockK8s({ pods: [ready({ ...BASE_ANN, [ANN.state]: "running" })] });
    k8s.on((c) => (c.script.includes("exit-code") ? "2\n" : undefined));
    const s = (await (await app(k8s).fetch(req(ROUTES.session(SID)))).json()) as Session;
    expect(s.state).toBe("failed");
    expect(s.exitCode).toBe(2);
    expect(s.detail).toContain("exited 2");
  });

  test("running with no marker yet stays running", async () => {
    const k8s = new MockK8s({ pods: [ready({ ...BASE_ANN, [ANN.state]: "running" })] });
    const s = (await (await app(k8s).fetch(req(ROUTES.session(SID)))).json()) as Session;
    expect(s.state).toBe("running");
    expect(s.exitCode).toBeUndefined();
  });

  test("a derived done survives a backend restart (it is on the pod)", async () => {
    const k8s = new MockK8s({ pods: [ready({ ...BASE_ANN, [ANN.state]: "running" })] });
    k8s.on((c) => (c.script.includes("exit-code") ? "0\n" : undefined));
    await app(k8s).fetch(req(ROUTES.session(SID)));
    const fresh = createApp({ k8s, config: { ...loadConfig({}), token: TOKEN } }); // new process, same cluster
    const s = (await (await fresh.fetch(req(ROUTES.session(SID)))).json()) as Session;
    expect(s.state).toBe("done");
  });
});

const MANIFEST: Manifest = {
  captured: {
    project_path: "/Users/a/car-mod-viz",
    slug: "-Users-a-car-mod-viz",
    branch: "feature/x",
    head: "abc123",
    claude_version: "1.2.3",
    session_ids: [SID],
    dirty_file_count: 2,
    largest_dirty_files: [],
    env_files: [],
    docker: null,
  },
  not_captured: {
    gitignored_files: 0,
    running_processes: true,
    env: { required_variables: [], unsatisfied_variables: [], skipped_env_files: [] },
    local_services: true,
    databases: true,
    orphan_containers: [],
    refused_containers: [],
    docker_volumes_never_return: true,
  },
};

function captureMock(manifest: Manifest = MANIFEST) {
  const k8s = new MockK8s({ pods: [ready({ ...BASE_ANN, [ANN.state]: "pending" })] });
  k8s.on((c) => {
    if (c.script.startsWith("d='/tmp/stepaway-cap-")) {
      const dir = c.script.match(/d='([^']+)'/)![1];
      return `${dir}/stepaway-1\n${JSON.stringify(manifest)}`;
    }
    return undefined;
  });
  return k8s;
}

describe("capture", () => {
  test("a 1 MB payload reaches tar -xz on the runner byte for byte", async () => {
    const k8s = captureMock();
    const payload = crypto.getRandomValues(new Uint8Array(1024 * 1024));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < payload.length; i += 64 * 1024) controller.enqueue(payload.subarray(i, i + 64 * 1024));
        controller.close();
      },
    });
    const res = await app(k8s).fetch(
      new Request(`http://backend${ROUTES.capture(SID)}`, {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}` },
        body,
        // @ts-ignore streaming request bodies need duplex in undici/Bun
        duplex: "half",
      }),
    );
    expect(res.status).toBe(200);
    const untar = k8s.execs[0];
    expect(untar.script).toContain("tar -xzf - -C /tmp/stepaway-cap-");
    expect(untar.stdinBytes).toBe(1024 * 1024);
  });

  test("restores with the manifest branch and the annotated work tree, then goes ready", async () => {
    const k8s = captureMock();
    const res = await app(k8s).fetch(
      req(`${ROUTES.capture(SID)}?setup=bun%20install`, { method: "POST", body: "tarbytes" }),
    );
    expect(res.status).toBe(200);
    const report = (await res.json()) as CaptureReport;
    expect(report).toMatchObject({
      restored: true,
      branch: "feature/x",
      workTree: "/work/car-mod-viz",
      gitDir: "/repo/car-mod-viz.git",
    });
    expect(report.docker).toEqual({ attempted: false, ok: false });
    expect(report.setup).toMatchObject({ attempted: true, ok: true, cmd: "bun install" });

    const restore = k8s.execs.find((e) => e.script.includes("RESTORE") || e.script.includes("gitdir: %s"))!;
    // core's RESTORE_RUNNER_SH, run with its five positional arguments
    expect(restore.command[4]).toMatch(/^\/tmp\/stepaway-cap-\d+\/stepaway-1$/);
    expect(restore.command.slice(5)).toEqual([
      "/repo/car-mod-viz.git",
      "/work/car-mod-viz",
      "feature/x",
      slugFor("/work/car-mod-viz"),
    ]);
    expect(k8s.pods.get(POD)!.metadata.annotations?.[ANN.state]).toBe("ready");
    expect(k8s.pods.get(POD)!.metadata.annotations?.[ANN.workTree]).toBe("/work/car-mod-viz");
  });

  test("docker restore only runs when the capture carried a compose project", async () => {
    const withDocker: Manifest = {
      ...MANIFEST,
      captured: {
        ...MANIFEST.captured,
        docker: {
          compose_file: "compose.yaml",
          project: "carmodviz",
          containers: [],
          volumes: [{ name: "db", bytes: 10 }],
          refused: [],
          orphans: [],
        },
      },
    };
    const k8s = captureMock(withDocker);
    k8s.on((c) => (c.script.includes("docker volume create") ? "restored volume db\nservices up\n" : undefined));
    const report = (await (
      await app(k8s).fetch(req(ROUTES.capture(SID), { method: "POST", body: "tarbytes" }))
    ).json()) as CaptureReport;
    expect(report.docker.attempted).toBe(true);
    expect(report.docker.ok).toBe(true);
    const dr = k8s.execs.find((e) => e.script.includes("docker volume create"))!;
    expect(dr.command[4]).toMatch(/^\/tmp\/stepaway-cap-\d+\/stepaway-1$/);
    expect(dr.command.slice(5)).toEqual(["/work/car-mod-viz", "compose.yaml"]);
  });

  test("a payload with no manifest fails the session, loudly", async () => {
    const k8s = new MockK8s({ pods: [ready({ ...BASE_ANN, [ANN.state]: "pending" })] });
    const res = await app(k8s).fetch(req(ROUTES.capture(SID), { method: "POST", body: "junk" }));
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toContain("manifest.json");
    expect(k8s.pods.get(POD)!.metadata.annotations?.[ANN.state]).toBe("failed");
  });

  test("a step that throws leaves the session failed, not stranded in restoring", async () => {
    // P0: only step 1 used to be wrapped, so a timeout in restore/docker/setup
    // escaped to the generic 500 handler and the pod stayed `restoring` forever.
    const k8s = captureMock();
    k8s.on((c) => (c.script.includes("gitdir: %s") ? new Error("exec timed out after 1200000ms") : undefined));
    const res = await app(k8s).fetch(req(ROUTES.capture(SID), { method: "POST", body: "tarbytes" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.detail).toContain("timed out");
    const ann = k8s.pods.get(POD)!.metadata.annotations!;
    expect(ann[ANN.state]).toBe("failed");
    expect(ann[ANN.detail]).toContain("timed out");
    // and the staging dir is not left behind on the runner
    expect(k8s.execs.some((e) => e.script.startsWith("rm -rf '/tmp/stepaway-cap-"))).toBe(true);
  });

  test("a failure detail is bounded and carries no environment values", async () => {
    const k8s = captureMock();
    k8s.on((c) => (c.script.includes("gitdir: %s") ? new Error("x".repeat(900)) : undefined));
    await app(k8s).fetch(req(ROUTES.capture(SID), { method: "POST", body: "tarbytes" }));
    expect(k8s.pods.get(POD)!.metadata.annotations![ANN.detail]!.length).toBe(400);
  });

  test("404 for an unknown session, without touching the cluster", async () => {
    const k8s = new MockK8s();
    expect((await app(k8s).fetch(req(ROUTES.capture(SID), { method: "POST", body: "x" }))).status).toBe(404);
    expect(k8s.execs).toHaveLength(0);
  });
});

describe("run", () => {
  test("probes permissions, stages the wrapper, launches tmux, sets running", async () => {
    const k8s = new MockK8s({ pods: [ready({ ...BASE_ANN, [ANN.state]: "ready", [ANN.workTree]: "/work/car-mod-viz" })] });
    k8s.on((c) => (c.script.includes("claude --help") ? "--permission-mode <mode>  auto, acceptEdits" : undefined));
    const res = await app(k8s).fetch(
      req(ROUTES.run(SID), { method: "POST", body: JSON.stringify({ instruction: "finish the refactor" }) }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.permissionFlags).toEqual(["--permission-mode", "auto"]);
    expect(body.how).toContain("tmux");

    const staged = k8s.execs.find((e) => e.script.includes("cat > '/work/.stepaway/run.sh'"))!;
    expect(staged.opts.stdin).toContain("--resume '0ea9f8b7-1111-2222-3333-444455556666'");
    expect(staged.opts.stdin).toContain("'finish the refactor'");
    expect(staged.opts.stdin).toContain("/work/.stepaway/exit-code");
    expect(body.log).toBe("/work/.stepaway/run.log");
    expect(k8s.pods.get(POD)!.metadata.annotations?.[ANN.state]).toBe("running");
  });

  test("falls back to --dangerously-skip-permissions on an old CLI", async () => {
    const k8s = new MockK8s({ pods: [ready({ ...BASE_ANN, [ANN.state]: "ready" })] });
    const body = await (await app(k8s).fetch(req(ROUTES.run(SID), { method: "POST", body: "{}" }))).json();
    expect(body.permissionFlags).toEqual(["--dangerously-skip-permissions"]);
    expect(body.warn).toContain("--permission-mode");
  });

  test("nohup fallback when the runner has no tmux", async () => {
    const k8s = new MockK8s({ pods: [ready({ ...BASE_ANN, [ANN.state]: "ready" })] });
    k8s.on((c) => (c.script.includes("tmux new-session") ? { code: 1, stderr: "tmux: not found" } : undefined));
    const body = await (await app(k8s).fetch(req(ROUTES.run(SID), { method: "POST", body: "{}" }))).json();
    expect(body.how).toContain("nohup");
    expect(k8s.pods.get(POD)!.metadata.annotations?.[ANN.state]).toBe("running");
  });

  test("a non-default remotePathBase moves the log, marker and wrapper with it", async () => {
    const k8s = new MockK8s({
      pods: [ready({ ...BASE_ANN, [ANN.remoteBase]: "/srv/work", [ANN.state]: "ready" })],
    });
    const body = await (await app(k8s).fetch(req(ROUTES.run(SID), { method: "POST", body: "{}" }))).json();
    expect(body.log).toBe("/srv/work/.stepaway/run.log");
    const staged = k8s.execs.find((e) => e.script.includes("run.sh"))!;
    expect(staged.script).toContain("'/srv/work/.stepaway/run.sh'");
    expect(staged.opts.stdin).toContain("'/srv/work/.stepaway/exit-code'");
    expect(staged.opts.stdin).not.toContain("'/work/.stepaway");

    // and the state derivation reads the marker from the same place
    k8s.on((c) => (c.script.includes("/srv/work/.stepaway/exit-code") ? "0\n" : undefined));
    const s = (await (await app(k8s).fetch(req(ROUTES.session(SID)))).json()) as Session;
    expect(s.state).toBe("done");
  });

  test("the launch wrapper records the exit code of claude, not of tee", () => {
    const script = launchScript({
      workTree: "/work/p",
      sid: "abc",
      instruction: "go",
      appendSystemPrompt: "commit",
      flags: ["--permission-mode", "auto"],
    });
    expect(script).toContain("set -o pipefail");
    expect(script).toContain("ec=${PIPESTATUS[0]}");
    expect(script).toContain("> '/work/.stepaway/exit-code'");
    expect(script).toContain("tee -a '/work/.stepaway/run.log'");
  });
});

describe("transcript", () => {
  test("plain body is the raw JSONL from the slug of the work tree", async () => {
    const k8s = new MockK8s({ pods: [ready({ ...BASE_ANN, [ANN.workTree]: "/work/car-mod-viz" })] });
    k8s.on((c) => (c.script.startsWith("cat ") ? '{"type":"user"}\n{"type":"assistant"}\n' : undefined));
    const res = await app(k8s).fetch(req(ROUTES.transcript(SID)));
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    expect(await res.text()).toBe('{"type":"user"}\n{"type":"assistant"}\n');
    expect(k8s.execs[0].script).toContain(transcriptPath("/work/car-mod-viz", SID));
  });

  test("?follow=1 is SSE, one event per line", async () => {
    const k8s = new MockK8s({ pods: [ready({ ...BASE_ANN, [ANN.workTree]: "/work/car-mod-viz" })] });
    k8s.on((c) => (c.script.includes("tail -n +1 -F") ? '{"a":1}\n{"b":2}\n' : undefined));
    const res = await app(k8s).fetch(req(`${ROUTES.transcript(SID)}?follow=1`));
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let seen = "";
    while (seen.split("\n\n").filter(Boolean).length < 2) {
      const { value, done } = await reader.read();
      if (done) break;
      seen += dec.decode(value, { stream: true });
    }
    await reader.cancel();
    const events = seen.split("\n\n").filter(Boolean);
    expect(events[0]).toBe('event: line\ndata: {"a":1}');
    expect(events[1]).toBe('event: line\ndata: {"b":2}');
  });
});

describe("archive", () => {
  test("runs the core capture script in the pod, streams the tar back", async () => {
    const k8s = new MockK8s({ pods: [ready({ ...BASE_ANN, [ANN.workTree]: "/work/car-mod-viz" })] });
    k8s.on((c) => (c.script.startsWith("tar czf - -C /tmp") ? "TARBYTES" : undefined));
    const res = await app(k8s).fetch(req(ROUTES.archive(SID)));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/gzip");
    expect(await res.text()).toBe("TARBYTES");
    const cap = k8s.execs[0];
    expect(cap.script).toContain("captured -> $OUT"); // core's CAPTURE_SH
    expect(cap.command[4]).toBe("/work/car-mod-viz");
    expect(cap.command[6]).toBe(SID);
    expect(k8s.execs[1].script).toContain("rm -rf /tmp/stepaway-arch-");
  });

  test("a tar that dies mid-stream aborts the response, not a clean truncated 200", async () => {
    // The archive body IS the user's work: a 200 whose gzip stops halfway is
    // worse than an error, because nothing downstream notices.
    const k8s = new MockK8s({ pods: [ready({ ...BASE_ANN, [ANN.workTree]: "/work/car-mod-viz" })] });
    k8s.on((c) =>
      c.script.startsWith("tar czf - -C /tmp") ? { code: 2, stdout: "HALF-A-TAR", stderr: "tar: write error" } : undefined,
    );
    const res = await app(k8s).fetch(req(ROUTES.archive(SID)));
    expect(res.status).toBe(200); // headers were already on the wire
    await expect(res.text()).rejects.toThrow();
  });

  test("a failed capture is a 500, not a truncated tar", async () => {
    const k8s = new MockK8s({ pods: [ready(BASE_ANN)] });
    k8s.on((c) => (c.script.includes("captured -> $OUT") ? { code: 1, stderr: "not a git repository" } : undefined));
    const res = await app(k8s).fetch(req(ROUTES.archive(SID)));
    expect(res.status).toBe(500);
    expect((await res.json()).detail).toContain("not a git repository");
  });
});

describe("env-names", () => {
  test("returns only the queried names the runner satisfies — never values", async () => {
    const k8s = new MockK8s({ pods: [ready(BASE_ANN)] });
    k8s.on((c) => (c.script.startsWith("for v in") ? "DATABASE_URL\nPORT\n" : undefined));
    const res = await app(k8s).fetch(req(`${ROUTES.envNames(SID)}?names=DATABASE_URL,PORT,STRIPE_KEY`));
    const body = (await res.json()) as EnvNamesResponse;
    expect(body).toEqual({ satisfied: ["DATABASE_URL", "PORT"] });
    expect(k8s.execs[0].script).not.toContain("printenv \"$v\"; echo");
  });

  test("ignores junk names and answers empty with no names", async () => {
    const k8s = new MockK8s({ pods: [ready(BASE_ANN)] });
    const res = await app(k8s).fetch(req(`${ROUTES.envNames(SID)}?names=${encodeURIComponent("a; rm -rf /,1BAD")}`));
    expect((await res.json()).satisfied).toEqual([]);
    expect(k8s.execs).toHaveLength(0);
  });
});

describe("claude token", () => {
  test("stores the token base64 in the auth Secret", async () => {
    const k8s = new MockK8s();
    const res = await app(k8s).fetch(
      req(ROUTES.claudeToken, { method: "PUT", body: JSON.stringify({ token: "sk-ant-oat-xyz" }) }),
    );
    expect(res.status).toBe(200);
    expect(k8s.secrets.get(AUTH_SECRET)![AUTH_SECRET_KEY]).toBe(Buffer.from("sk-ant-oat-xyz").toString("base64"));
  });

  test("an empty token is refused", async () => {
    const k8s = new MockK8s();
    expect(
      (await app(k8s).fetch(req(ROUTES.claudeToken, { method: "PUT", body: JSON.stringify({ token: " " }) }))).status,
    ).toBe(400);
    expect(k8s.secrets.size).toBe(0);
  });
});

describe("diagnostics", () => {
  test("shape matches api.ts; a clean cluster with no session warns about dind", async () => {
    const k8s = new MockK8s();
    k8s.secrets.set(AUTH_SECRET, { [AUTH_SECRET_KEY]: "eA==" });
    const body = (await (await app(k8s).fetch(req(ROUTES.diagnostics))).json()) as DiagnosticsResponse;
    expect(body.ok).toBe(true);
    for (const check of body.checks) {
      expect(typeof check.name).toBe("string");
      expect(typeof check.ok).toBe("boolean");
      expect(["pass", "warn", "fail"]).toContain(check.level);
    }
    const by = Object.fromEntries(body.checks.map((c) => [c.name, c]));
    expect(by["rbac"].level).toBe("pass");
    expect(by["storage class"].level).toBe("pass");
    expect(by["claude token"].level).toBe("pass");
    expect(by["dind"]).toMatchObject({ level: "warn", detail: "no session to probe" });
  });

  test("missing RBAC and missing token are failures; a forbidden storage class list is skipped", async () => {
    const k8s = new MockK8s();
    k8s.allow = false;
    k8s.storage = { ok: false, forbidden: true, names: [] };
    const body = (await (await app(k8s).fetch(req(ROUTES.diagnostics))).json()) as DiagnosticsResponse;
    expect(body.ok).toBe(false);
    const by = Object.fromEntries(body.checks.map((c) => [c.name, c]));
    expect(by["rbac"].level).toBe("fail");
    expect(by["claude token"].level).toBe("fail");
    expect(by["storage class"]).toMatchObject({ level: "warn", ok: true });
    expect(by["storage class"].detail).toContain("skipped");
  });

  test("dind is probed through a live session pod", async () => {
    const k8s = new MockK8s({ pods: [ready(BASE_ANN)] });
    k8s.secrets.set(AUTH_SECRET, { [AUTH_SECRET_KEY]: "eA==" });
    k8s.on((c) => (c.script.includes("docker info") ? "28.5.2\n" : undefined));
    const body = (await (await app(k8s).fetch(req(ROUTES.diagnostics))).json()) as DiagnosticsResponse;
    const dind = body.checks.find((c) => c.name === "dind")!;
    expect(dind).toMatchObject({ ok: true, level: "pass" });
    expect(dind.detail).toContain("28.5.2");
  });
});

describe("errors", () => {
  test("unknown routes answer the api.ts error shape", async () => {
    const res = await app(new MockK8s()).fetch(req("/v1/nope"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["detail", "error"]);
  });
});
