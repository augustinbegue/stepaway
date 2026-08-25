/**
 * The frozen v1 API (SPEC-v0.2 §3), implemented exactly as `@stepaway/core`'s
 * api.ts declares it. Routes never touch a cluster directly: everything goes
 * through the injected `K8s` port, which is what lets the tests run the whole
 * app against a mock.
 *
 * Division of labour, unchanged from v0.1 and restated because it is the point
 * of the backend: *nothing project-related runs in this container*. Restore,
 * docker, setup, capture and the agent launch are the bash constants from core,
 * executed inside the runner pod over the exec API.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  AUTH_SECRET,
  AUTH_SECRET_KEY,
  CAPTURE_SH,
  COMMIT_GUIDANCE,
  DEFAULT_INSTRUCTION,
  DOCKER_RESTORE_SH,
  RESTORE_RUNNER_SH,
  SESSION_LABEL,
  exitMarkerPath,
  permissionFlags,
  podManifest,
  podName,
  pvcManifest,
  runLogPath,
  slugFor,
  stepawayDir,
  type CaptureReport,
  type ClaudeTokenResponse,
  type CreateSessionRequest,
  type DeleteSessionResponse,
  type DiagnosticCheck,
  type DiagnosticsResponse,
  type EnvNamesResponse,
  type Manifest,
  type RunRequest,
  type RunResponse,
  type Session,
  type SessionState,
  type VersionResponse,
} from "@stepaway/core";
import type { K8s, PodObject } from "./k8s.js";
import {
  ANN,
  DEFAULT_REMOTE_BASE,
  annotationState,
  findSessionRecord,
  gitDirOf,
  listSessionRecords,
  podRecord,
  remoteBaseOf,
  setRecordState,
  setState,
  toSession,
  workTreeOf,
} from "./sessions.js";
import { bashLine, bashScript, lastLine, shq, tail } from "./sh.js";
import { VERSION, type ServerConfig } from "./config.js";
import {
  cleanupEnvSpec,
  ensureBuildJob,
  envImageRef,
  putEnvSpecSecret,
  resolveManifestCheck,
  validateEnvSpec,
  type AppDeps,
} from "./build.js";

// advanceBuild and the deps it needs live in build.ts (they are not
// Hono-specific); re-exported here because that is where callers found them.
export { advanceBuild, resolveManifestCheck } from "./build.js";
export type { AppDeps, BuildWatch } from "./build.js";

/** HOME in the runner (podspec.ts pins it). */
const RUNNER_HOME = "/root";

/** Long enough for `git clone` + `docker compose pull` on a cold pod. */
const RESTORE_TIMEOUT_MS = 20 * 60_000;
const SHORT_TIMEOUT_MS = 30_000;

export function createApp(deps: AppDeps) {
  const { k8s, config } = deps;
  const app = new Hono();
  const manifestCheck = resolveManifestCheck(deps);

  const fail = (c: Context, status: ContentfulStatusCode, error: string, detail?: string) =>
    c.json(detail ? { error, detail } : { error }, status);

  // ---- auth (everything but healthz) ------------------------------------
  app.use("/v1/*", async (c, next) => {
    if (c.req.path === "/v1/healthz") return next();
    const header = c.req.header("authorization") ?? "";
    const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!config.token) return fail(c, 503, "server misconfigured", "STEPAWAY_TOKEN is not set");
    if (!presented || !constantTimeEqual(presented, config.token)) {
      return fail(c, 401, "unauthorized", "send Authorization: Bearer <token>");
    }
    return next();
  });

  app.get("/v1/healthz", (c) => c.json({ ok: true }));

  app.get("/v1/version", (c) => c.json<VersionResponse>({ version: VERSION, api: "v1" }));

  // ---- sessions ---------------------------------------------------------
  app.post("/v1/sessions", async (c) => {
    let body: CreateSessionRequest;
    try {
      body = await c.req.json<CreateSessionRequest>();
    } catch {
      return fail(c, 400, "invalid body", "expected JSON {sessionId, project}");
    }
    if (!body?.sessionId || !body?.project) return fail(c, 400, "invalid body", "sessionId and project are required");
    const project = sanitizeProject(body.project);
    if (!project) return fail(c, 400, "invalid project", "project must be a plain path basename");
    const name = podName(body.sessionId);
    const remoteBase = (body.options?.remotePathBase || DEFAULT_REMOTE_BASE).replace(/\/+$/, "") || "/";

    // Idempotent per sessionId — including while the env image is still
    // building, when the session is a PVC and nothing else.
    const existing = await findSessionRecord(k8s, name);
    if (existing) {
      const had = existing.object.metadata.annotations?.[ANN.project];
      if (had && had !== project) {
        return fail(c, 409, "session exists", `${body.sessionId} already holds project "${had}", not "${project}"`);
      }
      return c.json<Session>(await toSession(k8s, existing), 200);
    }

    // ---- env resolution (SPEC-v0.3): image > envSpec > default -----------
    let image = body.options?.image?.trim() || undefined;
    let pullSecrets: string[] = [];
    let warning: string | undefined;
    let building: { hash: string } | undefined;
    const spec = body.envSpec;

    if (!image && spec) {
      if (!config.registry.host || !manifestCheck) {
        // Spec: fall through to the generic image, but say so.
        warning = "no cluster registry configured: the devcontainer env was ignored, using the default runner image";
      } else {
        const check = validateEnvSpec(spec);
        if (!check.ok) return fail(c, 400, "invalid envSpec", check.detail);
        let cached: boolean;
        try {
          cached = await manifestCheck(spec.hash);
        } catch (e) {
          return fail(c, 502, "registry unavailable", (e as Error).message);
        }
        image = envImageRef(config.registry.host, spec.hash);
        pullSecrets = [config.registry.pullSecret];
        if (!cached) building = { hash: spec.hash };
      }
    }

    const annotations: Record<string, string> = {
      [ANN.project]: project,
      [ANN.createdAt]: new Date().toISOString(),
      [ANN.state]: building ? "building" : "pending",
      [ANN.remoteBase]: remoteBase,
      ...(spec && image ? { [ANN.envHash]: spec.hash } : {}),
      ...(image ? { [ANN.image]: image } : {}),
      ...(pullSecrets.length ? { [ANN.pullSecret]: pullSecrets[0] } : {}),
      ...(warning ? { [ANN.detail]: warning } : {}),
    };

    try {
      // The PVC comes first in both flows: it carries the session label, so it
      // is what a `building` session *is* until its pod exists.
      await k8s.createFromYaml(
        "persistentvolumeclaims",
        pvcManifest({ name, sessionId: body.sessionId, ...config.runner, annotations }),
      );
      if (building) {
        await putEnvSpecSecret(k8s, spec!);
        await ensureBuildJob(k8s, { hash: building.hash, registry: config.registry });
      } else {
        await k8s.createFromYaml(
          "pods",
          podManifest({
            name,
            sessionId: body.sessionId,
            secretName: AUTH_SECRET,
            ...config.runner,
            ...(image ? { image } : {}),
            imagePullSecrets: pullSecrets,
            annotations,
          }),
        );
      }
    } catch (e) {
      return fail(c, 502, building ? "could not start the env build" : "could not create the runner", (e as Error).message);
    }

    if (building) {
      deps.onBuildStarted?.({ name, sessionId: body.sessionId, hash: building.hash });
    } else {
      deps.onSessionCreated?.(name);
    }

    const fresh =
      (await findSessionRecord(k8s, name)) ??
      podRecord({ metadata: { name, labels: { [SESSION_LABEL]: body.sessionId }, annotations } });
    return c.json<Session>(await toSession(k8s, fresh, { probe: false }), 201);
  });

  // Annotations only: probing here is one exec per pod, serially, on every
  // `stepaway ls`. GET /sessions/:id is the endpoint that derives, and the CLI
  // already calls it for the session it cares about.
  app.get("/v1/sessions", async (c) => {
    // Records, not pods: a `building` session has no pod yet and must still
    // show up in `stepaway ls`.
    const records = await listSessionRecords(k8s);
    const out: Session[] = [];
    for (const r of records) out.push(await toSession(k8s, r, { probe: false }));
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return c.json<Session[]>(out);
  });

  app.get("/v1/sessions/:id", async (c) => {
    const rec = await findSessionRecord(k8s, podName(sessionParam(c)));
    if (!rec) return notFound(c);
    return c.json<Session>(await toSession(k8s, rec));
  });

  app.delete("/v1/sessions/:id", async (c) => {
    const name = podName(sessionParam(c));
    const rec = await findSessionRecord(k8s, name);
    if (!rec) return notFound(c);
    if (rec.kind === "pod") await k8s.deletePod(name);
    const hash = rec.object.metadata.annotations?.[ANN.envHash];
    // A session abandoned mid-build owns a Secret nothing else will clean.
    if (hash && rec.kind === "pvc") await cleanupEnvSpec(k8s, hash);
    await k8s.deletePvc(name);
    return c.json<DeleteSessionResponse>({ ok: true, podName: name });
  });

  // ---- capture: upload -> restore -> docker -> setup ---------------------
  app.post("/v1/sessions/:id/capture", async (c) => {
    const found = await requirePod(c);
    if ("res" in found) return found.res;
    const pod = found.pod;
    const name = pod.metadata.name;
    const body = c.req.raw.body;
    if (!body) return fail(c, 400, "empty body", "the request body must be the capture tar.gz stream");

    const setupCmd = (c.req.query("setup") ?? "").trim();
    const dir = `/tmp/stepaway-cap-${Date.now()}`;
    await setState(k8s, pod, "restoring", { [ANN.detail]: null });

    /** Best-effort removal of the staging dir; never fails the request. */
    const cleanup = () =>
      k8s.exec(name, bashLine(`rm -rf ${shq(dir)}`), { timeoutMs: SHORT_TIMEOUT_MS }).catch(() => undefined);

    const failRestore = async (status: ContentfulStatusCode, error: string, detail: string) => {
      await cleanup();
      await setState(k8s, pod, "failed", { [ANN.detail]: detail.slice(0, 400) });
      return fail(c, status, error, detail);
    };

    // Every step below is an exec into the runner, and any of them can throw
    // (timeout, socket drop). A throw that escaped here used to leave the
    // session pinned at `restoring` forever — so the whole pipeline is one
    // try/catch that always lands on a terminal state.
    try {
      return await runCapture();
    } catch (e) {
      return await failRestore(502, "capture failed", (e as Error).message);
    }

    async function runCapture() {
      // 1. straight into tar: no staging on the backend, ever (§3).
      const un = await k8s.exec(name, bashLine(`rm -rf ${dir} && mkdir -p ${dir} && tar -xzf - -C ${dir}`), {
        stdin: body as ReadableStream<Uint8Array>,
        timeoutMs: RESTORE_TIMEOUT_MS,
      });
      if (un.code !== 0) return await failRestore(400, "capture upload failed", lastLine(un.stderr || un.stdout));

      // 2. the manifest is the source of truth for branch (and docker), and it
      //    is inside the payload — read it from the runner, do not ask the CLI.
      const probe = await k8s.exec(name, bashLine(manifestProbe(dir)), { timeoutMs: SHORT_TIMEOUT_MS });
      const nl = probe.stdout.indexOf("\n");
      const capDir = nl < 0 ? "" : probe.stdout.slice(0, nl).trim();
      let manifest: Manifest | null = null;
      try {
        manifest = JSON.parse(probe.stdout.slice(nl + 1)) as Manifest;
      } catch {
        manifest = null;
      }
      if (!capDir || !manifest) {
        return await failRestore(400, "invalid capture", "no manifest.json in the uploaded capture");
      }
      const branch = manifest.captured.branch || "main";

      const workTree = workTreeOf(pod);
      const gitDir = gitDirOf(pod);
      const slug = slugFor(workTree);
      await setState(k8s, pod, "restoring", { [ANN.workTree]: workTree });

      // 3. restore (separate git dir on the PVC)
      const rest = await k8s.exec(name, bashScript(RESTORE_RUNNER_SH, [capDir, gitDir, workTree, branch, slug]), {
        timeoutMs: RESTORE_TIMEOUT_MS,
      });
      if (rest.code !== 0) {
        return await failRestore(500, "restore failed", lastLine(rest.stderr || rest.stdout) || "restore script failed");
      }

      // 4. docker: only when the capture actually carried something
      const dockerManifest = manifest.captured.docker;
      const report: CaptureReport = {
        restored: true,
        gitDir,
        workTree,
        branch,
        docker: { attempted: false, ok: false },
        setup: { attempted: false, ok: false },
      };
      if (dockerManifest) {
        report.docker.attempted = true;
        const dr = await k8s.exec(
          name,
          bashScript(DOCKER_RESTORE_SH, [capDir, workTree, dockerManifest.compose_file ?? ""]),
          { timeoutMs: RESTORE_TIMEOUT_MS },
        );
        report.docker.ok = dr.code === 0 && !/^WARN:/m.test(dr.stdout);
        const d = tail(dr.stdout || dr.stderr, 3);
        if (d) report.docker.detail = d;
      }

      // 5. setup, in the restored tree, after the env files landed
      if (setupCmd) {
        report.setup = { attempted: true, ok: false, cmd: setupCmd };
        const su = await k8s.exec(name, bashLine(`cd ${shq(workTree)} && ${setupCmd}`), {
          timeoutMs: RESTORE_TIMEOUT_MS,
        });
        report.setup.ok = su.code === 0;
        report.setup.tail = tail(su.stdout || su.stderr, 5);
      }

      await cleanup();
      // A failed setup is not a failed session: the agent can usually fix it.
      await setState(k8s, pod, "ready", { [ANN.detail]: null });
      return c.json<CaptureReport>(report);
    }
  });

  // ---- run --------------------------------------------------------------
  app.post("/v1/sessions/:id/run", async (c) => {
    const found = await requirePod(c);
    if ("res" in found) return found.res;
    const pod = found.pod;
    const name = pod.metadata.name;
    let body: RunRequest = { instruction: DEFAULT_INSTRUCTION };
    try {
      const raw = await c.req.text();
      if (raw.trim()) body = { ...body, ...(JSON.parse(raw) as RunRequest) };
    } catch {
      return fail(c, 400, "invalid body", "expected JSON {instruction, appendSystemPrompt?}");
    }
    const instruction = (body.instruction || DEFAULT_INSTRUCTION).trim();
    const appendSystemPrompt = body.appendSystemPrompt ?? COMMIT_GUIDANCE;
    const workTree = workTreeOf(pod);
    const sid = sessionParam(c);
    // Everything the wrapper writes lives under the session's own remote base,
    // not a hard-coded /work — `remotePathBase` is a create-time option.
    const remoteBase = remoteBaseOf(pod);
    const swDir = stepawayDir(remoteBase);
    const runScript = `${swDir}/run.sh`;

    // Probe the installed CLI: never pass a flag this version does not know.
    const help = await k8s.exec(name, bashLine("claude --help 2>&1 || true"), { timeoutMs: SHORT_TIMEOUT_MS });
    const perm = permissionFlags(help.stdout + help.stderr);

    const script = launchScript({ workTree, remoteBase, sid, instruction, appendSystemPrompt, flags: perm.flags });
    const write = await k8s.exec(name, bashLine(`mkdir -p ${shq(swDir)} && cat > ${shq(runScript)}`), {
      stdin: script,
      timeoutMs: SHORT_TIMEOUT_MS,
    });
    if (write.code !== 0) return fail(c, 500, "could not stage the run", lastLine(write.stderr || write.stdout));

    let how = "tmux session 'stepaway'";
    const tmux = await k8s.exec(
      name,
      // tmux takes the command as argv, which keeps the path in one shq'd word.
      bashLine(`command -v tmux >/dev/null 2>&1 && tmux new-session -d -s stepaway bash -l ${shq(runScript)}`),
      { timeoutMs: SHORT_TIMEOUT_MS },
    );
    if (tmux.code !== 0) {
      const nh = await k8s.exec(name, bashLine(`nohup bash -l ${shq(runScript)} >/dev/null 2>&1 &`), {
        timeoutMs: SHORT_TIMEOUT_MS,
      });
      if (nh.code !== 0) {
        return fail(c, 500, "could not start the unattended run", lastLine(nh.stderr || tmux.stderr || nh.stdout));
      }
      how = "nohup (no tmux on the runner)";
    }
    await setState(k8s, pod, "running", { [ANN.exitCode]: null, [ANN.detail]: null });
    return c.json<RunResponse>({
      ok: true,
      how,
      log: runLogPath(remoteBase),
      permissionFlags: perm.flags,
      warn: perm.warn ?? undefined,
      state: "running",
    });
  });

  // ---- transcript -------------------------------------------------------
  app.get("/v1/sessions/:id/transcript", async (c) => {
    const found = await requirePod(c);
    if ("res" in found) return found.res;
    const pod = found.pod;
    const name = pod.metadata.name;
    const file = transcriptPath(workTreeOf(pod), sessionParam(c));

    if (c.req.query("follow") !== "1") {
      const stream = k8s.execStream(name, bashLine(`cat ${shq(file)} 2>/dev/null || true`));
      return new Response(stream as unknown as BodyInit, {
        headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
      });
    }
    return sseTranscript(k8s, name, file, c.req.raw.signal);
  });

  // ---- archive (the pull direction) -------------------------------------
  app.get("/v1/sessions/:id/archive", async (c) => {
    const found = await requirePod(c);
    if ("res" in found) return found.res;
    const pod = found.pod;
    const name = pod.metadata.name;
    const workTree = workTreeOf(pod);
    const dirName = `stepaway-arch-${Date.now()}`;
    const dir = `/tmp/${dirName}`;

    const cap = await k8s.exec(name, bashScript(CAPTURE_SH, [workTree, dir, sessionParam(c)]), {
      timeoutMs: RESTORE_TIMEOUT_MS,
    });
    if (cap.code !== 0) {
      return fail(c, 500, "capture on the runner failed", lastLine(cap.stderr || cap.stdout));
    }
    const stream = k8s.execStream(
      name,
      bashLine(`tar czf - -C /tmp ${dirName}; rc=$?; rm -rf ${dir}; exit $rc`),
      { timeoutMs: RESTORE_TIMEOUT_MS },
    );
    return new Response(stream as unknown as BodyInit, {
      headers: {
        "content-type": "application/gzip",
        "content-disposition": `attachment; filename="${dirName}.tar.gz"`,
        "cache-control": "no-store",
      },
    });
  });

  // ---- env names (names in, names out — values never cross) -------------
  app.get("/v1/sessions/:id/env-names", async (c) => {
    const found = await requirePod(c);
    if ("res" in found) return found.res;
    const pod = found.pod;
    const names = (c.req.query("names") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s));
    if (!names.length) return c.json<EnvNamesResponse>({ satisfied: [] });
    const script = `for v in ${names.map(shq).join(" ")}; do printenv "$v" >/dev/null 2>&1 && echo "$v"; done; true`;
    const r = await k8s.exec(pod.metadata.name, bashLine(script), { timeoutMs: SHORT_TIMEOUT_MS });
    const got = new Set(r.stdout.split("\n").map((s) => s.trim()).filter(Boolean));
    return c.json<EnvNamesResponse>({ satisfied: names.filter((n) => got.has(n)) });
  });

  // ---- claude token -----------------------------------------------------
  app.put("/v1/claude-token", async (c) => {
    let token = "";
    try {
      token = String((await c.req.json<{ token?: string }>())?.token ?? "");
    } catch {
      return fail(c, 400, "invalid body", "expected JSON {token}");
    }
    if (!token.trim()) return fail(c, 400, "invalid token", "token must be a non-empty string");
    try {
      // In memory only: base64 here, straight to the API server, never a file.
      await k8s.applySecret(AUTH_SECRET, { [AUTH_SECRET_KEY]: Buffer.from(token, "utf8").toString("base64") });
    } catch (e) {
      return fail(c, 502, "could not store the token", (e as Error).message);
    }
    return c.json<ClaudeTokenResponse>({ ok: true, secret: AUTH_SECRET });
  });

  // ---- diagnostics ------------------------------------------------------
  app.get("/v1/diagnostics", async (c) => {
    const checks: DiagnosticCheck[] = [];

    const rbac: [string, string, string | undefined, string?][] = [
      ["create", "pods", undefined],
      ["delete", "pods", undefined],
      ["create", "pods", "exec"],
      ["create", "persistentvolumeclaims", undefined],
      ["create", "secrets", undefined],
      // SPEC-v0.3 RBAC additions: only required when the devcontainer path is
      // actually enabled, so a registry-less install is not told it is broken.
      ["patch", "persistentvolumeclaims", undefined],
      ...(config.registry.host
        ? ([
            // jobs live in the batch group — an SSAR without it checks the
            // (nonexistent) core-group "jobs" and always denies.
            ["create", "jobs", undefined, "batch"],
            ["delete", "secrets", undefined],
          ] as [string, string, string | undefined, string?][])
        : []),
    ];
    const missing: string[] = [];
    for (const [verb, resource, sub, group] of rbac) {
      if (!(await k8s.canI(verb, resource, sub, group))) missing.push(`${verb} ${resource}${sub ? `/${sub}` : ""}`);
    }
    checks.push({
      name: "rbac",
      ok: missing.length === 0,
      level: missing.length ? "fail" : "pass",
      detail: missing.length ? `not permitted in ${k8s.namespace}: ${missing.join(", ")}` : `namespace ${k8s.namespace}`,
    });

    const sc = await k8s.listStorageClasses();
    const want = c.req.query("storageClass") ?? "longhorn";
    if (sc.forbidden) {
      checks.push({
        name: "storage class",
        ok: true,
        level: "warn",
        detail: "skipped: storageclasses are cluster-scoped and the backend Role is namespace-scoped",
      });
    } else if (!sc.ok) {
      checks.push({ name: "storage class", ok: true, level: "warn", detail: "skipped: could not list storage classes" });
    } else {
      const found = sc.names.includes(want);
      checks.push({
        name: "storage class",
        ok: found,
        level: found ? "pass" : "warn",
        detail: found ? want : `"${want}" not among: ${sc.names.join(", ") || "(none)"}`,
      });
    }

    let secretOk = false;
    try {
      const s = await k8s.getSecret(AUTH_SECRET);
      secretOk = !!s?.[AUTH_SECRET_KEY];
    } catch {
      secretOk = false;
    }
    checks.push({
      name: "claude token",
      ok: secretOk,
      level: secretOk ? "pass" : "fail",
      detail: secretOk ? `secret ${AUTH_SECRET} present` : `no ${AUTH_SECRET} secret — run 'stepaway auth'`,
    });

    // dind is only probeable through a runner: the backend has no daemon.
    let pods: PodObject[] = [];
    try {
      pods = await k8s.listPods(SESSION_LABEL);
    } catch {
      pods = [];
    }
    const live = pods.find((p) => !p.metadata.deletionTimestamp);
    if (!live) {
      checks.push({ name: "dind", ok: true, level: "warn", detail: "no session to probe" });
    } else {
      let ok = false;
      let detail = "";
      try {
        const r = await k8s.exec(live.metadata.name, bashLine("docker info --format '{{.ServerVersion}}'"), {
          timeoutMs: SHORT_TIMEOUT_MS,
        });
        ok = r.code === 0;
        detail = ok ? `docker ${lastLine(r.stdout)} on ${live.metadata.name}` : lastLine(r.stderr || r.stdout);
      } catch (e) {
        detail = (e as Error).message;
      }
      checks.push({ name: "dind", ok, level: ok ? "pass" : "fail", detail });
    }

    const body: DiagnosticsResponse = { checks, ok: checks.every((k) => k.level !== "fail") };
    return c.json(body);
  });

  app.notFound((c) => fail(c, 404, "not found", `no route ${c.req.method} ${c.req.path}`));
  app.onError((e, c) => fail(c, 500, "internal error", e.message));

  /**
   * The runner pod for `:id`, or the response to send instead.
   *
   * Record-aware on purpose: a `building` session is a PVC and nothing else,
   * so GET /sessions/:id happily returns it while every pod route used to
   * answer 404 — "no such session" for a session the API had just described.
   * A session that exists but has no pod yet is a 409, not a 404.
   */
  async function requirePod(c: Context): Promise<{ pod: PodObject } | { res: Response }> {
    const name = podName(sessionParam(c));
    const pod = await k8s.getPod(name);
    if (pod) return { pod };
    const rec = await findSessionRecord(k8s, name);
    if (rec) {
      return { res: fail(c, 409, "session is still building", annotationState(rec.object)) as unknown as Response };
    }
    return { res: notFound(c) as unknown as Response };
  }
  function notFound(c: Context) {
    return fail(c, 404, "no such session", `no runner pod for ${sessionParam(c)}`);
  }

  return app;
}

export type App = ReturnType<typeof createApp>;

/** The `:id` path param, always a string. */
function sessionParam(c: Context): string {
  return c.req.param("id") ?? "";
}

/** Transcript file for a session, in the runner's HOME. */
export function transcriptPath(workTree: string, sessionId: string): string {
  return `${RUNNER_HOME}/.claude/projects/${slugFor(workTree)}/${sessionId}.jsonl`;
}

/**
 * Resolve the capture root inside the uploaded tree (the CLI's tar has one
 * top-level directory; a bare capture has none) and print it, then the manifest.
 */
function manifestProbe(dir: string): string {
  return [
    `d=${shq(dir)}`,
    `if [ ! -f "$d/manifest.json" ]; then`,
    `  sub=$(find "$d" -mindepth 1 -maxdepth 1 -type d | head -1)`,
    `  if [ -n "$sub" ] && [ -f "$sub/manifest.json" ]; then d="$sub"; fi`,
    `fi`,
    `printf '%s\\n' "$d"`,
    `cat "$d/manifest.json" 2>/dev/null || true`,
  ].join("\n");
}

/**
 * The launch wrapper. Two jobs beyond starting claude: tee to a log a human can
 * read, and write the process-exit marker that makes `running -> done|failed`
 * derivable without a watch loop.
 */
export function launchScript(o: {
  workTree: string;
  /** the session's remote path base; the .stepaway dir hangs off it. */
  remoteBase?: string;
  sid: string | null;
  instruction: string;
  appendSystemPrompt: string;
  flags: string[];
}): string {
  const swDir = stepawayDir(o.remoteBase ?? DEFAULT_REMOTE_BASE);
  const runLog = runLogPath(o.remoteBase ?? DEFAULT_REMOTE_BASE);
  const exitMarker = exitMarkerPath(o.remoteBase ?? DEFAULT_REMOTE_BASE);
  const parts = [
    "claude",
    "-p",
    ...(o.sid ? ["--resume", shq(o.sid)] : []),
    shq(o.instruction),
    "--append-system-prompt",
    shq(o.appendSystemPrompt),
    ...o.flags.map((f) => (f.startsWith("--") ? f : shq(f))),
  ];
  return [
    "#!/bin/bash",
    "# written by the stepaway backend; the exit marker drives the run state.",
    `mkdir -p ${shq(swDir)}`,
    `rm -f ${shq(exitMarker)}`,
    `cd ${shq(o.workTree)} || exit 1`,
    "set -o pipefail",
    `${parts.join(" ")} 2>&1 | tee -a ${shq(runLog)}`,
    "ec=${PIPESTATUS[0]}",
    `printf '%s\\n' "\${ec}" > ${shq(exitMarker)}`,
    "exit ${ec}",
    "",
  ].join("\n");
}

/**
 * `?follow=1`: SSE, one `event: line` per transcript line, a comment heartbeat
 * every 15s so idle proxies keep the connection, and a hard stop the moment the
 * client goes away (which also closes the exec socket into the pod).
 */
export function sseTranscript(k8s: K8s, pod: string, file: string, signal: AbortSignal | undefined): Response {
  const upstream = k8s.execStream(pod, bashLine(`touch ${shq(file)} 2>/dev/null; tail -n +1 -F ${shq(file)} 2>/dev/null`));
  const enc = new TextEncoder();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let beat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const stop = () => {
        if (beat) clearInterval(beat);
        reader?.cancel().catch(() => undefined);
        upstream.cancel?.().catch(() => undefined);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      signal?.addEventListener("abort", stop, { once: true });
      beat = setInterval(() => {
        try {
          controller.enqueue(enc.encode(": heartbeat\n\n"));
        } catch {
          stop();
        }
      }, 15_000);

      reader = upstream.getReader();
      (async () => {
        const dec = new TextDecoder();
        let buf = "";
        try {
          for (;;) {
            const { value, done } = await reader!.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let nl: number;
            while ((nl = buf.indexOf("\n")) >= 0) {
              const line = buf.slice(0, nl);
              buf = buf.slice(nl + 1);
              if (line.trim()) controller.enqueue(enc.encode(`event: line\ndata: ${line}\n\n`));
            }
          }
        } catch {
          /* client gone or pod gone: both end the stream */
        } finally {
          stop();
        }
      })();
    },
    cancel() {
      if (beat) clearInterval(beat);
      reader?.cancel().catch(() => undefined);
    },
  });

  return new Response(stream as unknown as BodyInit, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

/** Project must be a plain basename: it becomes a path inside the runner. */
export function sanitizeProject(project: string): string | null {
  const p = project.trim();
  if (!p || p === "." || p === ".." || /[/\\\0]/.test(p)) return null;
  return p;
}

/** Length-independent (digest first) constant-time token comparison. */
export function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
