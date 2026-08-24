import * as fs from "node:fs";
import * as path from "node:path";
import { run, runAsync, shq, which } from "./sh.js";
import type { DockerManifest } from "@stepaway/core";

// Moved to @stepaway/core in v0.2 (the backend runs it too); re-exported here
// so the CLI's own call sites keep their import.
export { DOCKER_RESTORE_SH } from "@stepaway/core";

/**
 * Docker carry (spec §3, POC D3 verbatim).
 *
 * Rules that are load-bearing, not preferences:
 *   - scope is the project's compose project, never the daemon;
 *   - containers are stopped BEFORE the volume tar (a hot copy can never reach
 *     the fidelity bar P6 measured), with consent taken up front;
 *   - `docker stop -t 30`; a container that will not stop in time has its
 *     volumes REFUSED, never torn;
 *   - volumes travel, images do not — the target re-pulls by digest;
 *   - the laptop's containers are restarted afterwards. Handing the laptop back
 *     with a dead database is worse than the tear we are avoiding.
 *
 * Volume tars stream through `docker run -i ... tar` on stdio rather than a
 * bind mount, because the runner's daemon is a dind sidecar with its own
 * filesystem — a bind mount of the pod's path would silently mount nothing.
 */

export const HELPER_IMAGE = "alpine";

const COMPOSE_CANDIDATES = ["compose.yaml", "compose.yml", "docker-compose.yml", "docker-compose.yaml"];

export function findComposeFile(root: string, configured: string | null): string | null {
  if (configured) return fs.existsSync(path.join(root, configured)) ? configured : null;
  for (const c of COMPOSE_CANDIDATES) if (fs.existsSync(path.join(root, c))) return c;
  return null;
}

export function dockerAvailable(): boolean {
  return which("docker") && run("docker", ["info", "--format", "{{.ServerVersion}}"]).code === 0;
}

export type ContainerInfo = {
  id: string;
  name: string;
  image: string;
  digest: string;
  volumes: string[];
};

function inspectContainers(root: string, ids: string[]): ContainerInfo[] {
  if (!ids.length) return [];
  const fmt =
    "{{.Id}}\t{{.Name}}\t{{.Config.Image}}\t{{.Image}}\t" +
    '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}},{{end}}{{end}}';
  const r = run("docker", ["inspect", "-f", fmt, ...ids], { cwd: root });
  if (r.code !== 0) return [];
  return r.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [id = "", name = "", image = "", digest = "", vols = ""] = l.split("\t");
      return {
        id,
        name: name.replace(/^\//, ""),
        image,
        digest,
        volumes: vols.split(",").map((v) => v.trim()).filter(Boolean),
      };
    });
}

function composeProjectName(root: string, ids: string[]): string {
  if (ids.length) {
    const r = run("docker", ["inspect", "-f", '{{index .Config.Labels "com.docker.compose.project"}}', ids[0]], {
      cwd: root,
    });
    const n = r.stdout.trim();
    if (r.code === 0 && n && n !== "<no value>") return n;
  }
  return path.basename(root).toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

export type DockerPlan = {
  composeFile: string;
  project: string;
  containers: ContainerInfo[];
  orphans: string[];
  volumes: string[];
};

/**
 * What a push WOULD do to docker. Read-only: nothing is stopped here, so the
 * consent screen can name every container before anything is touched.
 */
export function planDocker(root: string, configuredCompose: string | null): DockerPlan | null {
  const composeFile = findComposeFile(root, configuredCompose);
  if (!composeFile) return null;
  if (!dockerAvailable()) return null;

  const ps = run("docker", ["compose", "-f", composeFile, "ps", "-q"], { cwd: root });
  const ids = ps.code === 0 ? ps.stdout.split("\n").map((s) => s.trim()).filter(Boolean) : [];
  const containers = inspectContainers(root, ids);
  const project = composeProjectName(root, ids);

  const all = run("docker", ["ps", "-q"], { cwd: root });
  const allIds = all.code === 0 ? all.stdout.split("\n").map((s) => s.trim()).filter(Boolean) : [];
  const mine = new Set(containers.map((c) => c.id));
  const orphans = inspectContainers(
    root,
    allIds.filter((id) => ![...mine].some((m) => m.startsWith(id) || id.startsWith(m))),
  )
    .filter((c) => !c.name.startsWith(`${project}-`))
    .map((c) => c.name);

  const vl = run("docker", ["volume", "ls", "-q", "--filter", `label=com.docker.compose.project=${project}`], {
    cwd: root,
  });
  const volumes = vl.code === 0 ? vl.stdout.split("\n").map((s) => s.trim()).filter(Boolean) : [];

  return { composeFile, project, containers, orphans, volumes };
}

export type DockerCaptureResult = { manifest: DockerManifest; warnings: string[] };

/**
 * Execute the plan: stop, tar volumes into <captureDir>/volumes/, restart.
 * Only ever called after the consent step has been accepted.
 */
/**
 * Quiesce the compose project and archive its volumes.
 *
 * Async throughout: `docker stop` waits up to 30s per container and each
 * volume tar can run for minutes. Sync spawns here were the second thing
 * freezing push's spinner.
 */
export async function captureDocker(
  root: string,
  captureDir: string,
  plan: DockerPlan,
  log: (s: string) => void,
): Promise<DockerCaptureResult> {
  const warnings: string[] = [];
  const refused: string[] = [];
  const stopped: ContainerInfo[] = [];

  for (const c of plan.containers) {
    log(`stopping ${c.name} (30s grace)\n`);
    await runAsync("docker", ["stop", "-t", "30", c.id], { cwd: root });
    const st = await runAsync("docker", ["inspect", "-f", "{{.State.Running}}", c.id], { cwd: root });
    if (st.stdout.trim() === "true") {
      refused.push(c.name);
      warnings.push(`${c.name} did not stop within 30s — its volumes are NOT carried (never torn).`);
    } else {
      stopped.push(c);
    }
  }

  const refusedVolumes = new Set(
    plan.containers.filter((c) => refused.includes(c.name)).flatMap((c) => c.volumes),
  );
  const outDir = path.join(captureDir, "volumes");
  const carried: { name: string; bytes: number }[] = [];
  if (plan.volumes.length) fs.mkdirSync(outDir, { recursive: true });
  for (const v of plan.volumes) {
    if (refusedVolumes.has(v)) continue;
    const dest = path.join(outDir, `${v}.tar.gz`);
    const r = await runAsync("bash", [
      "-c",
      `set -o pipefail; docker run --rm -v ${shq(v)}:/v:ro ${HELPER_IMAGE} tar czf - -C /v . > ${shq(dest)}`,
    ]);
    if (r.code !== 0) {
      warnings.push(`could not archive volume ${v}: ${(r.stderr || r.stdout).trim().split("\n").pop()}`);
      fs.rmSync(dest, { force: true });
      continue;
    }
    let bytes = 0;
    try {
      bytes = fs.statSync(dest).size;
    } catch {
      /* ignore */
    }
    carried.push({ name: v, bytes });
    log(`archived volume ${v} (${human(bytes)})\n`);
  }

  // restart contract: the laptop gets its services back, always
  for (const c of stopped) {
    const r = await runAsync("docker", ["start", c.id], { cwd: root });
    if (r.code !== 0) warnings.push(`could not restart ${c.name} locally: ${(r.stderr || r.stdout).trim()}`);
  }
  if (stopped.length) log(`restarted ${stopped.length} local container(s)\n`);

  const manifest: DockerManifest = {
    compose_file: plan.composeFile,
    project: plan.project,
    containers: plan.containers.map((c) => ({ name: c.name, image: c.image, digest: c.digest })),
    volumes: carried,
    refused,
    orphans: plan.orphans,
  };
  fs.writeFileSync(path.join(captureDir, "meta", "docker.json"), JSON.stringify(manifest, null, 2) + "\n");
  return { manifest, warnings };
}

export function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let b = bytes / 1024;
  let i = 0;
  while (b >= 1024 && i < u.length - 1) {
    b /= 1024;
    i++;
  }
  return `${b.toFixed(b < 10 ? 1 : 0)} ${u[i]}`;
}
