/**
 * Runner pod + PVC manifests, generated in code (v0.1: one pod per session).
 *
 * Shape:
 *   - main container `runner`: node:22-bookworm-slim, boot-installs claude,
 *     readiness = /ready. Gets CLAUDE_CODE_OAUTH_TOKEN from the `stepaway-auth`
 *     Secret (written by `stepaway auth`) and talks to the sidecar daemon.
 *   - sidecar `dind`: docker:dind, privileged, its own emptyDir for
 *     /var/lib/docker, TLS off so it listens on 127.0.0.1:2375 inside the pod.
 *   - /repo  = per-session PVC (longhorn, 2Gi) — holds the git dir, durable.
 *   - /work  = emptyDir — holds the working tree, disposable by construction.
 */

export const AUTH_SECRET = "stepaway-auth";
export const AUTH_SECRET_KEY = "token";

/** Pod/PVC name for a session: `stepaway-<first 8 hex of sid>`. */
export function podName(sessionId: string): string {
  const hex = sessionId.toLowerCase().replace(/[^0-9a-f]/g, "");
  const id = (hex || "00000000").slice(0, 8).padEnd(8, "0");
  return `stepaway-${id}`;
}

export const SESSION_LABEL = "stepaway.dev/session";

/**
 * Chart/env-driven overrides for the server-owned template (SPEC-v0.2 §2:
 * "runner image + resources" are chart values, never a CLI release). All
 * optional: omitted fields keep the v0.1 defaults byte for byte.
 */
export type RunnerOverrides = {
  image?: string;
  cpuRequest?: string;
  memoryRequest?: string;
  memoryLimit?: string;
  storageClass?: string;
  storageSize?: string;
  /**
   * Docker-in-Docker sidecar. Default true; false drops the privileged `dind`
   * container and its storage volume (clusters that refuse privileged pods).
   */
  dindEnabled?: boolean;
  /**
   * v0.3: names of dockerconfigjson Secrets the kubelet uses to pull `image`.
   * Only set for env images that live in the cluster registry — the default
   * public image needs none, so an empty/absent list renders nothing.
   */
  imagePullSecrets?: string[];
  /** extra pod annotations (the backend stores session state in these). */
  annotations?: Record<string, string>;
};

export type PodOpts = {
  name: string;
  sessionId: string;
  /** null = no auth secret wired (doctor/tests); push always passes it. */
  secretName?: string | null;
} & RunnerOverrides;

/** `key: value` annotation block at the given indent, or "" when there is none. */
function annotationsBlock(ann: Record<string, string> | undefined, indent: string): string {
  const entries = Object.entries(ann ?? {}).filter(([, v]) => v !== undefined && v !== null);
  if (!entries.length) return "";
  return `${indent}annotations:\n` + entries.map(([k, v]) => `${indent}  ${k}: ${JSON.stringify(String(v))}`).join("\n") + "\n";
}

export function pvcManifest(o: { name: string; sessionId: string } & RunnerOverrides): string {
  return `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ${o.name}
  labels:
    app.kubernetes.io/name: stepaway-runner
    ${SESSION_LABEL}: ${o.sessionId}
${annotationsBlock(o.annotations, "  ")}spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: ${o.storageClass ?? "longhorn"}
  resources:
    requests:
      storage: ${o.storageSize ?? "2Gi"}
`;
}

export function podManifest(o: PodOpts): string {
  const secret = o.secretName === undefined ? AUTH_SECRET : o.secretName;
  const tokenEnv = secret
    ? `        - name: CLAUDE_CODE_OAUTH_TOKEN
          valueFrom:
            secretKeyRef:
              name: ${secret}
              key: ${AUTH_SECRET_KEY}
`
    : "";
  const dind = o.dindEnabled !== false;
  const dindContainer = dind
    ? `    - name: dind
      image: docker:dind
      securityContext:
        privileged: true
      # dockerd directly: the dind entrypoint adds its own 0.0.0.0:2375 listener
      # when TLS is off (duplicate bind), and loopback-only keeps the daemon off
      # the pod IP.
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
`
    : "";
  const dindVolume = dind
    ? `    - name: dind-storage
      emptyDir: {}
`
    : "";
  const pullSecrets = (o.imagePullSecrets ?? []).filter(Boolean);
  const pullSecretsBlock = pullSecrets.length
    ? `  imagePullSecrets:\n` + pullSecrets.map((n) => `    - name: ${n}`).join("\n") + "\n"
    : "";
  return `apiVersion: v1
kind: Pod
metadata:
  name: ${o.name}
  labels:
    app.kubernetes.io/name: stepaway-runner
    ${SESSION_LABEL}: ${o.sessionId}
${annotationsBlock(o.annotations, "  ")}spec:
  restartPolicy: Always
${pullSecretsBlock}  containers:
    - name: runner
      image: ${o.image ?? "node:22-bookworm-slim"}
      command: ["bash", "-lc"]
      args:
        - |
          set -e
          export DEBIAN_FRONTEND=noninteractive
          apt-get update -qq
          apt-get install -y -qq --no-install-recommends \\
            git tmux jq procps ca-certificates curl unzip less docker.io
          npm i -g @anthropic-ai/claude-code
          # bun: detectSetup can pick 'bun install', and the image has none.
          # One static binary, so it costs a download, not a build.
          curl -fsSL https://bun.sh/install | bash || true
          for b in bun bunx; do
            [ -x "/root/.bun/bin/$b" ] && ln -sf "/root/.bun/bin/$b" "/usr/local/bin/$b" || true
          done
          # debian's docker.io ships no compose plugin; fetch the static binary
          ARCH=$(uname -m); case "$ARCH" in aarch64) ARCH=aarch64;; *) ARCH=x86_64;; esac
          mkdir -p /usr/local/lib/docker/cli-plugins
          curl -fsSL -o /usr/local/lib/docker/cli-plugins/docker-compose \\
            "https://github.com/docker/compose/releases/download/v2.39.2/docker-compose-linux-$ARCH"
          chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
          mkdir -p /work /repo /work/.stepaway
          touch /ready
          echo "stepaway runner ready: $(claude --version 2>/dev/null || echo 'claude missing')"
          sleep infinity
      workingDir: /work
      env:
        - name: HOME
          value: /root
        - name: SHELL
          value: /bin/bash
        - name: DOCKER_HOST
          value: tcp://127.0.0.1:2375
${tokenEnv}      readinessProbe:
        exec:
          command: ["test", "-f", "/ready"]
        initialDelaySeconds: 5
        periodSeconds: 5
        failureThreshold: 120
      resources:
        requests:
          cpu: ${o.cpuRequest ?? "250m"}
          memory: ${o.memoryRequest ?? "512Mi"}
        limits:
          memory: ${o.memoryLimit ?? "4Gi"}
      volumeMounts:
        - name: work
          mountPath: /work
        - name: repo
          mountPath: /repo
${dindContainer}  volumes:
    - name: work
      emptyDir: {}
${dindVolume}    - name: repo
      persistentVolumeClaim:
        claimName: ${o.name}
`;
}
