/**
 * SPEC-v0.3 devcontainer runners, server side.
 *
 * Every test here is a clause of the spec's "Build path": the resolution order
 * (image > envSpec > default), the registry cache check, the `building` state
 * that exists before any pod does, and the Job contract the chart and the
 * builder image are written against.
 */

import { describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import { ROUTES, SESSION_LABEL, podName, type Session } from "@stepaway/core";
import { advanceBuild, createApp, type AppDeps } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import {
  ENVSPEC_PATH,
  ENV_HASH_LABEL,
  MAX_ENVSPEC_BYTES,
  buildJobManifest,
  buildJobName,
  envImageRef,
  envSpecSecretName,
  registryManifestCheck,
  validateEnvSpec,
} from "../src/build.js";
import { ANN } from "../src/sessions.js";
import { pollBuild } from "../src/server.js";
import { MockK8s } from "./mock-k8s.js";

const TOKEN = "test-token-0123456789";
const SID = "0ea9f8b7-1111-2222-3333-444455556666";
const SID2 = "1fb0c9a8-2222-3333-4444-555566667777";
const POD = podName(SID);
const HASH = "0123456789abcdef";

const REGISTRY_ENV = {
  REGISTRY_HOST: "registry.stepaway.dev",
  REGISTRY_USER: "pusher",
  REGISTRY_PASS: "s3cret",
  BUILDER_IMAGE: "ghcr.io/augustinbegue/stepaway-builder:v1",
};

/** A real (tiny) tar.gz, base64 — the payload shape the CLI sends. */
const TGZ = gzipSync(Buffer.from("devcontainer.json\n")).toString("base64");

function deps(o: { k8s: MockK8s; env?: Record<string, string>; cached?: boolean; check?: AppDeps["manifestCheck"] }) {
  const d: AppDeps = {
    k8s: o.k8s,
    config: { ...loadConfig({ ...(o.env ?? REGISTRY_ENV) }), token: TOKEN },
    manifestCheck: o.check ?? (async () => o.cached === true),
    onBuildStarted: () => undefined,
  };
  return d;
}

function req(path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${TOKEN}`);
  return new Request(`http://backend${path}`, { ...init, headers });
}

function createBody(o: { sessionId?: string; hash?: string; filesTgz?: string; image?: string } = {}) {
  return JSON.stringify({
    sessionId: o.sessionId ?? SID,
    project: "car-mod-viz",
    ...(o.image ? { options: { image: o.image } } : {}),
    ...(o.image ? {} : { envSpec: { hash: o.hash ?? HASH, filesTgz: o.filesTgz ?? TGZ } }),
  });
}

const post = (d: AppDeps, body: string) => createApp(d).fetch(req(ROUTES.sessions, { method: "POST", body }));

describe("env resolution order (image > envSpec > default)", () => {
  test("an explicit options.image wins and never touches the registry", async () => {
    const k8s = new MockK8s();
    let probed = false;
    const d = deps({
      k8s,
      check: async () => {
        probed = true;
        return true;
      },
    });
    const res = await post(d, createBody({ image: "ghcr.io/me/my-env:1" }));
    expect(res.status).toBe(201);
    expect(((await res.json()) as Session).state).toBe("pending");
    expect(probed).toBe(false);
    expect(k8s.created.find((x) => x.kind === "pods")!.yaml).toContain("image: ghcr.io/me/my-env:1");
    expect(k8s.jobs.size).toBe(0);
  });

  test("envSpec with no REGISTRY_HOST falls through to the default image, with a warning", async () => {
    const k8s = new MockK8s();
    const res = await post(deps({ k8s, env: {} }), createBody());
    expect(res.status).toBe(201);
    const s = (await res.json()) as Session;
    expect(s.state).toBe("pending");
    expect(s.detail).toContain("no cluster registry configured");
    const pod = k8s.created.find((x) => x.kind === "pods")!.yaml;
    expect(pod).toContain("image: node:22-bookworm-slim");
    expect(pod).not.toContain("imagePullSecrets");
    expect(k8s.jobs.size).toBe(0);
    expect(k8s.secrets.size).toBe(0);
  });

  test("no envSpec at all is the untouched v0.2 flow", async () => {
    const k8s = new MockK8s();
    const res = await post(deps({ k8s }), JSON.stringify({ sessionId: SID, project: "car-mod-viz" }));
    expect(res.status).toBe(201);
    expect(((await res.json()) as Session).state).toBe("pending");
    expect(k8s.created.map((x) => x.kind)).toEqual(["persistentvolumeclaims", "pods"]);
  });
});

describe("registry cache hit", () => {
  test("boots straight from the built image, with the pull secret", async () => {
    const k8s = new MockK8s();
    const res = await post(deps({ k8s, cached: true }), createBody());
    expect(res.status).toBe(201);
    const s = (await res.json()) as Session;
    expect(s.state).toBe("pending"); // no build: a hit is indistinguishable from v0.2

    const pod = k8s.created.find((x) => x.kind === "pods")!.yaml;
    expect(pod).toContain(`image: registry.stepaway.dev/stepaway-env:env-${HASH}`);
    expect(pod).toContain("imagePullSecrets:\n    - name: stepaway-registry-pull");
    expect(k8s.jobs.size).toBe(0);
    expect(k8s.secrets.size).toBe(0); // nothing to build, nothing to ship
    expect(k8s.pods.get(POD)!.metadata.annotations?.[ANN.envHash]).toBe(HASH);
  });

  test("a registry that answers neither 200 nor 404 is a 502, not a silent rebuild", async () => {
    const k8s = new MockK8s();
    const d = deps({
      k8s,
      check: async () => {
        throw new Error("registry registry.stepaway.dev answered 500 for env-x");
      },
    });
    const res = await post(d, createBody());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("registry unavailable");
    expect(k8s.created).toHaveLength(0);
  });
});

describe("registry cache miss -> building", () => {
  async function miss() {
    const k8s = new MockK8s();
    const watches: unknown[] = [];
    const d = { ...deps({ k8s, cached: false }), onBuildStarted: (w: unknown) => watches.push(w) };
    const res = await post(d, createBody());
    return { k8s, d, res, watches };
  }

  test("creates the PVC, the envspec Secret and the Job — and no pod", async () => {
    const { k8s, res, watches } = await miss();
    expect(res.status).toBe(201);
    const s = (await res.json()) as Session;
    expect(s.state).toBe("building");
    expect(s.podName).toBe(POD);

    expect(k8s.pods.size).toBe(0);
    const pvc = k8s.pvcObjects.get(POD)!;
    expect(pvc.metadata.labels?.[SESSION_LABEL]).toBe(SID);
    expect(pvc.metadata.annotations?.[ANN.state]).toBe("building");
    expect(pvc.metadata.annotations?.[ANN.envHash]).toBe(HASH);
    expect(pvc.metadata.annotations?.[ANN.image]).toBe(envImageRef("registry.stepaway.dev", HASH));

    expect(k8s.secrets.get(envSpecSecretName(HASH))!["files.tgz"]).toBe(TGZ);
    expect(k8s.jobs.has(buildJobName(HASH))).toBe(true);
    expect(watches).toEqual([{ name: POD, sessionId: SID, hash: HASH }]);
  });

  test("re-POSTing the same session while it builds returns the building session", async () => {
    const { k8s, d } = await miss();
    const again = await post(d, createBody());
    expect(again.status).toBe(200);
    expect(((await again.json()) as Session).state).toBe("building");
    expect(k8s.jobs.size).toBe(1);
    // and a different project on the same id is still a conflict
    const other = await post(d, JSON.stringify({ sessionId: SID, project: "other", envSpec: { hash: HASH, filesTgz: TGZ } }));
    expect(other.status).toBe(409);
  });

  test("a second session with the same env hash reuses the running Job", async () => {
    const { k8s, d } = await miss();
    const second = await post(d, createBody({ sessionId: SID2 }));
    expect(second.status).toBe(201);
    expect(((await second.json()) as Session).state).toBe("building");
    expect(k8s.jobs.size).toBe(1);
    expect([...k8s.created.filter((x) => x.kind === "jobs")]).toHaveLength(1);
    expect(k8s.pvcObjects.size).toBe(2);
  });

  test("GET /sessions lists the building session even though it has no pod", async () => {
    const { k8s, d } = await miss();
    const list = (await (await createApp(d).fetch(req(ROUTES.sessions))).json()) as Session[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: SID, state: "building", podName: POD });
    expect(k8s.execs).toHaveLength(0);

    const one = (await (await createApp(d).fetch(req(ROUTES.session(SID)))).json()) as Session;
    expect(one.state).toBe("building"); // and it is never exec-probed
    expect(k8s.execs).toHaveLength(0);
  });

  test("deleting a building session cleans its envspec Secret", async () => {
    const { k8s, d } = await miss();
    const res = await createApp(d).fetch(req(ROUTES.session(SID), { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(k8s.secrets.has(envSpecSecretName(HASH))).toBe(false);
    expect(k8s.pvcObjects.size).toBe(0);
  });
});

describe("advanceBuild", () => {
  async function building() {
    const k8s = new MockK8s();
    const started: string[] = [];
    const d: AppDeps = { ...deps({ k8s, cached: false }), onSessionCreated: (p) => started.push(p) };
    await post(d, createBody());
    return { k8s, d, started, watch: { name: POD, sessionId: SID, hash: HASH } };
  }

  test("a Job still running leaves the session building", async () => {
    const { k8s, d, watch } = await building();
    expect(await advanceBuild(d, watch)).toBe("building");
    expect(k8s.pods.size).toBe(0);
  });

  test("Job success creates the pod from the built image and moves to pending", async () => {
    const { k8s, d, started, watch } = await building();
    k8s.jobs.get(buildJobName(HASH))!.status = { succeeded: 1 };

    expect(await advanceBuild(d, watch)).toBe("pending");
    const pod = k8s.pods.get(POD)!;
    expect(pod.metadata.annotations?.[ANN.state]).toBe("pending");
    expect(pod.metadata.annotations?.[ANN.project]).toBe("car-mod-viz");
    const yaml = k8s.created.find((x) => x.kind === "pods")!.yaml;
    expect(yaml).toContain(`image: ${envImageRef("registry.stepaway.dev", HASH)}`);
    expect(yaml).toContain("- name: stepaway-registry-pull");
    expect(k8s.secrets.has(envSpecSecretName(HASH))).toBe(false); // envspec cleaned
    expect(started).toEqual([POD]);

    // and the session now reads from the pod
    const s = (await (await createApp(d).fetch(req(ROUTES.session(SID)))).json()) as Session;
    expect(s.state).toBe("pending");
  });

  test("Job failure fails the session with the builder log tail and cleans the Secret", async () => {
    const { k8s, d, watch } = await building();
    k8s.jobs.get(buildJobName(HASH))!.status = { failed: 1 };
    k8s.pods.set("stepaway-build-01234567-abcde", {
      metadata: { name: "stepaway-build-01234567-abcde", labels: { [ENV_HASH_LABEL]: HASH } },
    });
    k8s.podLogsByPod.set("stepaway-build-01234567-abcde", "step 3/9\nERROR: feature install failed\n");

    expect(await advanceBuild(d, watch)).toBe("failed");
    const s = (await (await createApp(d).fetch(req(ROUTES.session(SID)))).json()) as Session;
    expect(s.state).toBe("failed");
    expect(s.detail).toContain("ERROR: feature install failed");
    expect(k8s.secrets.has(envSpecSecretName(HASH))).toBe(false);
  });

  test("a failed Job with no logs still gets a detail, never an empty failure", async () => {
    const { k8s, d, watch } = await building();
    k8s.jobs.get(buildJobName(HASH))!.status = {
      failed: 1,
      conditions: [{ type: "Failed", status: "True", reason: "DeadlineExceeded", message: "Job was active longer than 1200 seconds" }],
    };
    expect(await advanceBuild(d, watch)).toBe("failed");
    const s = (await (await createApp(d).fetch(req(ROUTES.session(SID)))).json()) as Session;
    expect(s.detail).toContain("DeadlineExceeded");
  });

  test("a Job reaped by its TTL is judged by the registry, not assumed failed", async () => {
    const { k8s, watch } = await building();
    k8s.jobs.clear();
    const d: AppDeps = { ...deps({ k8s, cached: true }), onSessionCreated: () => undefined };
    expect(await advanceBuild(d, watch)).toBe("pending");
    expect(k8s.pods.has(POD)).toBe(true);
  });

  test("a Job gone with no image in the registry is a failure, and is idempotent", async () => {
    const { k8s, d, watch } = await building();
    k8s.jobs.clear();
    expect(await advanceBuild(d, watch)).toBe("failed");
    expect(await advanceBuild(d, watch)).toBe("failed"); // re-reads the annotation, does nothing
  });

  test("a registry that cannot answer leaves the session building, it does not fail it", async () => {
    const { k8s, watch } = await building();
    k8s.jobs.clear(); // reaped by its TTL: the registry is the only witness left
    let asked = 0;
    const d: AppDeps = {
      ...deps({
        k8s,
        check: async () => {
          asked++;
          throw new Error("registry registry.stepaway.dev unreachable: ECONNREFUSED");
        },
      }),
      onSessionCreated: () => undefined,
    };
    // "I don't know" is not "it failed": a succeeded build must not be buried
    // by an outage. The state stays building and the next poll retries.
    expect(await advanceBuild(d, watch)).toBe("building");
    expect(k8s.pvcObjects.get(POD)!.metadata.annotations?.[ANN.state]).toBe("building");
    expect(k8s.pods.size).toBe(0);
    expect(k8s.secrets.has(envSpecSecretName(HASH))).toBe(true); // nothing cleaned up yet
    expect(await advanceBuild(d, watch)).toBe("building");
    expect(asked).toBe(2);
  });

  test("a deleted session ends the watch", async () => {
    const { k8s, d, watch } = await building();
    k8s.pvcObjects.clear();
    expect(await advanceBuild(d, watch)).toBe("gone");
  });

  test("a re-run failed build deletes the corpse Job instead of 409ing forever", async () => {
    const { k8s, d, watch } = await building();
    k8s.jobs.get(buildJobName(HASH))!.status = { failed: 1 };
    await advanceBuild(d, watch);
    k8s.pvcObjects.clear(); // user destroyed and re-pushed
    const res = await post(d, createBody());
    expect(res.status).toBe(201);
    expect(((await res.json()) as Session).state).toBe("building");
    expect(k8s.deleted).toContain(`job/${buildJobName(HASH)}`);
    expect(k8s.jobs.get(buildJobName(HASH))!.status?.active).toBe(1);
  });
});

describe("a building session is a 409 on the pod routes, never a 404", () => {
  async function building() {
    const k8s = new MockK8s();
    const d = deps({ k8s, cached: false });
    await post(d, createBody());
    return { k8s, app: createApp(d) };
  }

  test("GET /sessions/:id answers, so capture must not claim there is no session", async () => {
    const { app } = await building();
    expect((await app.fetch(req(ROUTES.session(SID)))).status).toBe(200);

    const res = await app.fetch(req(ROUTES.capture(SID), { method: "POST", body: "irrelevant" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "session is still building", detail: "building" });
  });

  test("run on a building session is a 409 and starts nothing", async () => {
    const { k8s, app } = await building();
    const res = await app.fetch(req(ROUTES.run(SID), { method: "POST", body: "{}" }));
    expect(res.status).toBe(409);
    expect((await res.json()).detail).toBe("building");
    expect(k8s.execs).toHaveLength(0);
  });

  test("a session that does not exist at all is still a 404", async () => {
    const { app } = await building();
    const res = await app.fetch(req(ROUTES.run(SID2), { method: "POST", body: "{}" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("no such session");
  });
});

describe("pollBuild", () => {
  test("timing out fails the session and cleans up like every other terminal path", async () => {
    const k8s = new MockK8s();
    const d = deps({ k8s, cached: false });
    await post(d, createBody());
    expect(k8s.secrets.has(envSpecSecretName(HASH))).toBe(true);

    // The Job stays "running" forever; only the deadline can end this watch.
    await pollBuild(d, { name: POD, sessionId: SID, hash: HASH }, { pollMs: 1, timeoutMs: -1 });

    const pvc = k8s.pvcObjects.get(POD)!;
    expect(pvc.metadata.annotations?.[ANN.state]).toBe("failed");
    expect(pvc.metadata.annotations?.[ANN.detail]).toContain("did not finish");
    // the privileged dind Job must not be left burning until activeDeadlineSeconds
    expect(k8s.jobs.has(buildJobName(HASH))).toBe(false);
    expect(k8s.deleted).toContain(`job/${buildJobName(HASH)}`);
    expect(k8s.secrets.has(envSpecSecretName(HASH))).toBe(false);
  });

  test("a build that resolves ends the watch without touching the session", async () => {
    const k8s = new MockK8s();
    const d = deps({ k8s, cached: false });
    await post(d, createBody());
    k8s.jobs.get(buildJobName(HASH))!.status = { succeeded: 1 };

    await pollBuild(d, { name: POD, sessionId: SID, hash: HASH }, { pollMs: 1, timeoutMs: 10_000 });
    expect(k8s.pods.has(POD)).toBe(true);
    expect(k8s.deleted).not.toContain(`job/${buildJobName(HASH)}`);
  });
});

describe("envSpec validation (server side of a user-supplied payload)", () => {
  const bad = async (spec: { hash?: string; filesTgz?: string }) => {
    const k8s = new MockK8s();
    const res = await post(
      deps({ k8s, cached: false }),
      JSON.stringify({ sessionId: SID, project: "car-mod-viz", envSpec: { hash: HASH, filesTgz: TGZ, ...spec } }),
    );
    return { res, k8s };
  };

  test("non-base64 filesTgz is a 400 and creates nothing", async () => {
    const { res, k8s } = await bad({ filesTgz: "not base64!!!" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid envSpec");
    expect(k8s.created).toHaveLength(0);
    expect(k8s.secrets.size).toBe(0);
  });

  test("a payload over 1 MiB is a 400", async () => {
    const big = Buffer.alloc(MAX_ENVSPEC_BYTES + 1024, 0x41).toString("base64");
    const { res } = await bad({ filesTgz: big });
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toContain("limit is");
  });

  test("a bare tar (not gzipped) is refused before it reaches a builder", async () => {
    const { res } = await bad({ filesTgz: Buffer.from("ustar-ish payload").toString("base64") });
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toContain("gzip");
  });

  test("a hash that is not hex is refused (it would name k8s objects)", async () => {
    const { res } = await bad({ hash: "../../etc/passwd" });
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toContain("hex");
  });

  test("validateEnvSpec accepts the real thing", () => {
    expect(validateEnvSpec({ hash: HASH, filesTgz: TGZ })).toMatchObject({ ok: true });
  });
});

describe("the Job manifest is the contract with the chart and the builder image", () => {
  const yaml = buildJobManifest({
    hash: HASH,
    registry: loadConfig(REGISTRY_ENV).registry,
  });

  test("names, TTL and deadline are the frozen ones", () => {
    expect(yaml).toContain(`name: stepaway-build-01234567`);
    expect(yaml).toContain(`${ENV_HASH_LABEL}: ${HASH}`);
    expect(yaml).toContain("ttlSecondsAfterFinished: 3600");
    expect(yaml).toContain("activeDeadlineSeconds: 1200");
    expect(yaml).toContain("backoffLimit: 0");
    expect(yaml).toContain("secretName: stepaway-envspec-01234567");
  });

  test("dind is a native sidecar, or the Job would never complete", () => {
    // A plain second container never exits, and a Job's pod completes only when
    // every container has terminated. initContainer + restartPolicy: Always is
    // the sidecar form the kubelet excludes from completion.
    const init = yaml.slice(yaml.indexOf("initContainers:"), yaml.indexOf("containers:\n        - name: builder"));
    expect(init).toContain("- name: dind");
    expect(init).toContain("restartPolicy: Always");
    expect(init).toContain("privileged: true");
  });

  test("the builder gets its inputs by env, and its credentials by secretKeyRef", () => {
    expect(yaml).toContain("image: ghcr.io/augustinbegue/stepaway-builder:v1");
    expect(yaml).toContain(`value: "registry.stepaway.dev/stepaway-env:env-${HASH}"`);
    expect(yaml).toContain(`value: ${ENVSPEC_PATH}`);
    // the feature ref is the builder image's own default (full OCI ref); the
    // Job must NOT override it, or the two drift (a truncated ref here once
    // pointed at a nonexistent artifact)
    expect(yaml).not.toContain("STEPAWAY_FEATURE");
    expect(yaml).toContain("name: stepaway-registry-auth");
    expect(yaml).toContain("key: username");
    expect(yaml).toContain("key: password");
    // the one thing that must never be here
    expect(yaml).not.toContain("s3cret");
  });
});

describe("registry config", () => {
  test("the frozen env names reach the registry config, host scheme-stripped", () => {
    const cfg = loadConfig({ ...REGISTRY_ENV, REGISTRY_HOST: "https://registry.stepaway.dev/" }).registry;
    expect(cfg).toEqual({
      host: "registry.stepaway.dev",
      user: "pusher",
      pass: "s3cret",
      builderImage: "ghcr.io/augustinbegue/stepaway-builder:v1",
      pullSecret: "stepaway-registry-pull",
      authSecret: "stepaway-registry-auth",
    });
  });

  test("an unset REGISTRY_HOST disables the devcontainer path", () => {
    expect(loadConfig({}).registry.host).toBe("");
  });
});

describe("registryManifestCheck", () => {
  const cfg = loadConfig(REGISTRY_ENV).registry;

  test("200 is a hit, on the spec's URL with basic auth", async () => {
    let seen: { url: string; headers: Record<string, string> } | null = null;
    const check = registryManifestCheck(cfg, (async (url: string, init: RequestInit) => {
      seen = { url, headers: init.headers as Record<string, string> };
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch);
    expect(await check(HASH)).toBe(true);
    expect(seen!.url).toBe(`https://registry.stepaway.dev/v2/stepaway-env/manifests/env-${HASH}`);
    expect(seen!.headers.authorization).toBe(`Basic ${Buffer.from("pusher:s3cret").toString("base64")}`);
    expect(seen!.headers.accept).toContain("application/vnd.oci.image.manifest.v1+json");
    expect(seen!.headers.accept).toContain("application/vnd.docker.distribution.manifest.v2+json");
  });

  test("404 is a miss; anything else throws", async () => {
    const at = (status: number) =>
      registryManifestCheck(cfg, (async () => new Response("", { status })) as unknown as typeof fetch)(HASH);
    expect(await at(404)).toBe(false);
    await expect(at(401)).rejects.toThrow("401");
    await expect(at(500)).rejects.toThrow("500");
  });
});
