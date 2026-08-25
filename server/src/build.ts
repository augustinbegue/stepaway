/**
 * Devcontainer env-image builds (SPEC-v0.3 "Build path").
 *
 * The shape of the feature: a session whose repo carries a devcontainer.json
 * boots from an image built *from that devcontainer.json*, cached in the
 * cluster registry under `stepaway-env:env-<hash>`. The hash is computed by
 * the CLI over the .devcontainer files, so an unchanged env config is a
 * registry cache hit and costs one HEAD-shaped GET instead of a build.
 *
 * Everything here is pure-ish: manifest lookups go through an injectable
 * `ManifestCheck` and cluster writes go through the `K8s` port, so the whole
 * build path is testable without a registry or a cluster.
 */

import type { K8s } from "./k8s.js";
import type { RegistryConfig } from "./config.js";

/** Repository inside the registry that holds every built env image. */
export const ENV_REPO = "stepaway-env";

/** Label that ties a build Job (and its pod) to the env hash it is building. */
export const ENV_HASH_LABEL = "stepaway.dev/env-hash";

/** Key of the tar.gz inside the envspec Secret, and where the builder finds it. */
export const ENVSPEC_KEY = "files.tgz";
export const ENVSPEC_MOUNT = "/spec";
export const ENVSPEC_PATH = `${ENVSPEC_MOUNT}/${ENVSPEC_KEY}`;

/** The devcontainer feature the builder always merges in (SPEC-v0.3). */
// The feature ref is the builder image's own default (STEPAWAY_FEATURE env in
// builder/Dockerfile — full OCI ref incl. /stepaway:0); the Job deliberately
// does not override it so the two can't drift.

/** ≤ 1 MiB of .devcontainer files — the contract in api.ts. */
export const MAX_ENVSPEC_BYTES = 1024 * 1024;

/** Hashes come from the CLI; they name k8s objects, so validate them hard. */
export function isEnvHash(hash: string): boolean {
  return /^[0-9a-f]{8,64}$/.test(hash);
}

export const envTag = (hash: string) => `env-${hash}`;
export const shortHash = (hash: string) => hash.slice(0, 8);
export const buildJobName = (hash: string) => `stepaway-build-${shortHash(hash)}`;
export const envSpecSecretName = (hash: string) => `stepaway-envspec-${shortHash(hash)}`;

/** Fully qualified ref of a built env image. */
export function envImageRef(registryHost: string, hash: string): string {
  return `${registryHost}/${ENV_REPO}:${envTag(hash)}`;
}

/**
 * Registry cache probe: true = the image is already there.
 * Injectable so tests never touch the network.
 */
export type ManifestCheck = (hash: string) => Promise<boolean>;

const MANIFEST_ACCEPT = [
  "application/vnd.docker.distribution.manifest.v2+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.oci.image.index.v1+json",
].join(", ");

/**
 * The real check. 200 = hit, 404 = miss; anything else (401, 5xx, DNS) throws,
 * because "the registry is broken" must never be reported to the user as
 * "cache miss" — that would start a build doomed to fail on push.
 */
export function registryManifestCheck(cfg: RegistryConfig, fetchImpl: typeof fetch = fetch): ManifestCheck {
  return async (hash: string) => {
    const url = `https://${cfg.host}/v2/${ENV_REPO}/manifests/${envTag(hash)}`;
    const headers: Record<string, string> = { accept: MANIFEST_ACCEPT };
    if (cfg.user) {
      headers.authorization = `Basic ${Buffer.from(`${cfg.user}:${cfg.pass}`, "utf8").toString("base64")}`;
    }
    let res: Response;
    try {
      res = await fetchImpl(url, { method: "GET", headers });
    } catch (e) {
      throw new Error(`registry ${cfg.host} unreachable: ${(e as Error).message}`);
    }
    if (res.ok) return true;
    if (res.status === 404) return false;
    throw new Error(`registry ${cfg.host} answered ${res.status} for ${envTag(hash)}`);
  };
}

// ---------------------------------------------------------------------------
// envspec Secret
// ---------------------------------------------------------------------------

export type EnvSpecInput = { hash: string; filesTgz: string };
export type EnvSpecCheck = { ok: true; bytes: number } | { ok: false; detail: string };

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * The payload is user input that becomes a Secret and then a tar the builder
 * unpacks. The server cannot see inside the tar (the builder untars it), so it
 * enforces what it *can*: a well-formed hash, real base64, and the 1 MiB cap —
 * before anything reaches the cluster.
 */
export function validateEnvSpec(spec: EnvSpecInput): EnvSpecCheck {
  if (!isEnvHash(spec.hash ?? "")) {
    return { ok: false, detail: "envSpec.hash must be 8-64 lowercase hex characters" };
  }
  const raw = (spec.filesTgz ?? "").replace(/\s+/g, "");
  if (!raw) return { ok: false, detail: "envSpec.filesTgz is empty" };
  if (!BASE64.test(raw)) return { ok: false, detail: "envSpec.filesTgz is not valid base64" };
  // Cheap length math first: never allocate a megabyte to find out it is two.
  const bytes = Math.floor((raw.length * 3) / 4) - (raw.endsWith("==") ? 2 : raw.endsWith("=") ? 1 : 0);
  if (bytes > MAX_ENVSPEC_BYTES) {
    return { ok: false, detail: `envSpec.filesTgz is ${bytes} bytes; the limit is ${MAX_ENVSPEC_BYTES}` };
  }
  let decoded: Buffer;
  try {
    decoded = Buffer.from(raw, "base64");
  } catch {
    return { ok: false, detail: "envSpec.filesTgz is not valid base64" };
  }
  // Buffer.from is lenient: a round-trip is the only honest base64 check.
  if (decoded.length === 0 || decoded.toString("base64").replace(/=+$/, "") !== raw.replace(/=+$/, "")) {
    return { ok: false, detail: "envSpec.filesTgz is not valid base64" };
  }
  if (decoded.length > MAX_ENVSPEC_BYTES) {
    return { ok: false, detail: `envSpec.filesTgz is ${decoded.length} bytes; the limit is ${MAX_ENVSPEC_BYTES}` };
  }
  // gzip magic: catches "I sent the tar, not the tar.gz" at the door.
  if (decoded[0] !== 0x1f || decoded[1] !== 0x8b) {
    return { ok: false, detail: "envSpec.filesTgz must be a gzip (tar.gz) stream" };
  }
  return { ok: true, bytes: decoded.length };
}

/** Secret data is base64 already — the request carried it that way. */
export async function putEnvSpecSecret(k8s: K8s, spec: EnvSpecInput): Promise<void> {
  await k8s.applySecret(envSpecSecretName(spec.hash), { [ENVSPEC_KEY]: spec.filesTgz.replace(/\s+/g, "") });
}

// ---------------------------------------------------------------------------
// build Job
// ---------------------------------------------------------------------------

export type BuildJobOpts = {
  hash: string;
  registry: RegistryConfig;
};

/**
 * The build Job.
 *
 * Two things are worth knowing about the shape:
 *   - dind is a *native sidecar* (an initContainer with restartPolicy: Always),
 *     not a plain second container. A plain sidecar never exits, and a Job's
 *     pod only completes when every container has terminated — the Job would
 *     hang until activeDeadlineSeconds every single time.
 *   - push credentials are a secretKeyRef into the chart's registry-auth
 *     Secret, never inline values, so a Job manifest is safe to `kubectl get`.
 *
 * The builder image's entrypoint is the contract: it reads the tar.gz at
 * $ENVSPEC_PATH, builds the devcontainer with $STEPAWAY_FEATURE merged in,
 * pushes $IMAGE_REF to $REGISTRY_HOST as $REGISTRY_USER/$REGISTRY_PASS, and
 * exits 0 on success.
 */
export function buildJobManifest(o: BuildJobOpts): string {
  const name = buildJobName(o.hash);
  const secret = envSpecSecretName(o.hash);
  const cred = (envName: string, key: string) =>
    `            - name: ${envName}
              valueFrom:
                secretKeyRef:
                  name: ${o.registry.authSecret}
                  key: ${key}
                  optional: true
`;
  return `apiVersion: batch/v1
kind: Job
metadata:
  name: ${name}
  labels:
    app.kubernetes.io/name: stepaway-build
    ${ENV_HASH_LABEL}: ${o.hash}
spec:
  backoffLimit: 0
  ttlSecondsAfterFinished: 3600
  activeDeadlineSeconds: 1200
  template:
    metadata:
      labels:
        app.kubernetes.io/name: stepaway-build
        ${ENV_HASH_LABEL}: ${o.hash}
    spec:
      restartPolicy: Never
      initContainers:
        # Native sidecar (restartPolicy: Always): excluded from Job completion.
        - name: dind
          image: docker:dind
          restartPolicy: Always
          securityContext:
            privileged: true
          command: ["dockerd", "--host=tcp://127.0.0.1:2375", "--host=unix:///var/run/docker.sock"]
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              memory: 4Gi
          volumeMounts:
            - name: dind-storage
              mountPath: /var/lib/docker
      containers:
        - name: builder
          image: ${o.registry.builderImage}
          env:
            - name: DOCKER_HOST
              value: tcp://127.0.0.1:2375
            - name: REGISTRY_HOST
              value: ${JSON.stringify(o.registry.host)}
${cred("REGISTRY_USER", "username")}${cred("REGISTRY_PASS", "password")}            - name: IMAGE_REF
              value: ${JSON.stringify(envImageRef(o.registry.host, o.hash))}
            - name: ENV_HASH
              value: ${JSON.stringify(o.hash)}
            - name: ENVSPEC_PATH
              value: ${ENVSPEC_PATH}
          resources:
            requests:
              cpu: 500m
              memory: 1Gi
            limits:
              memory: 6Gi
          volumeMounts:
            - name: spec
              mountPath: ${ENVSPEC_MOUNT}
              readOnly: true
      volumes:
        - name: spec
          secret:
            secretName: ${secret}
        - name: dind-storage
          emptyDir: {}
`;
}

export type JobOutcome = "running" | "succeeded" | "failed";

/** Job status, reduced to the three answers the session flow cares about. */
export function jobOutcome(job: { status?: { succeeded?: number; failed?: number; conditions?: { type: string; status: string }[] } } | null): JobOutcome | "gone" {
  if (!job) return "gone";
  const conds = job.status?.conditions ?? [];
  if ((job.status?.succeeded ?? 0) > 0 || conds.some((c) => c.type === "Complete" && c.status === "True")) {
    return "succeeded";
  }
  if ((job.status?.failed ?? 0) > 0 || conds.some((c) => c.type === "Failed" && c.status === "True")) {
    return "failed";
  }
  return "running";
}

/** Why a Job failed, as one short line (never env values — this is a log tail). */
export function jobFailureReason(job: { status?: { conditions?: { type: string; status: string; reason?: string; message?: string }[] } } | null): string {
  const c = (job?.status?.conditions ?? []).find((x) => x.type === "Failed" && x.status === "True");
  if (!c) return "";
  return [c.reason, c.message].filter(Boolean).join(": ");
}

/**
 * Ensure a build is in flight for `hash`, reusing one that already is.
 * A finished (succeeded or failed) Job with the same name is deleted first:
 * without that, a retried build would 409 forever against its own corpse.
 */
export async function ensureBuildJob(k8s: K8s, o: BuildJobOpts): Promise<{ job: string; reused: boolean }> {
  const name = buildJobName(o.hash);
  const existing = (await k8s.listJobs(`${ENV_HASH_LABEL}=${o.hash}`)).find((j) => !j.metadata.deletionTimestamp);
  if (existing && jobOutcome(existing) === "running") return { job: existing.metadata.name, reused: true };
  if (existing) await k8s.deleteJob(existing.metadata.name);
  await k8s.createJobFromYaml(buildJobManifest(o));
  return { job: name, reused: false };
}

/** Last lines of the builder container's log, for the `failed` session detail. */
export async function buildLogTail(k8s: K8s, hash: string, lines = 20): Promise<string> {
  try {
    const pods = await k8s.listPods(`${ENV_HASH_LABEL}=${hash}`);
    const pod = pods[pods.length - 1];
    if (!pod) return "";
    const log = await k8s.podLogs(pod.metadata.name, { container: "builder", tailLines: lines });
    return log
      .split("\n")
      .map((l) => l.trimEnd())
      .filter(Boolean)
      .slice(-lines)
      .join("\n");
  } catch {
    return "";
  }
}

/** Best-effort removal of the envspec Secret once the build is over. */
export async function cleanupEnvSpec(k8s: K8s, hash: string): Promise<void> {
  await k8s.deleteSecret(envSpecSecretName(hash)).catch(() => undefined);
}
