import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { human, run, shq } from "./sh.js";

/**
 * Env resolution step 2 (SPEC-v0.3): the project's devcontainer definition,
 * hashed and packed so the backend can build and cache
 * `stepaway-env:env-<hash>` and boot the session pod from it.
 *
 * Everything here is local and pure-ish: node builtins plus one `tar` spawn.
 * No devcontainer semantics are interpreted — the file is an opaque blob to the
 * CLI, exactly as the spec wants (the builder owns the format).
 */

/** The wire payload cap for `CreateSessionRequest.envSpec.filesTgz`. */
export const ENVSPEC_MAX_BYTES = 1024 * 1024;

/** A devcontainer definition lives at one of these, relative to the repo root. */
const DEVCONTAINER_DIR = ".devcontainer";
const BARE_FILE = ".devcontainer.json";

export type EnvSpec = {
  /** sha256 (first 16 hex) over the sorted relative paths + contents. */
  hash: string;
  /** base64 tar.gz of the same files, relative paths preserved. Empty (with
   * `bytes: 0`) when the spec was resolved without `pack` — see
   * resolveRunnerEnv. */
  filesTgz: string;
  /** repo-relative paths that went in, sorted — for the consent summary. */
  files: string[];
  /** decoded size of filesTgz, for reporting. */
  bytes: number;
};

/** Files under a directory, repo-relative, '/' separated, sorted. */
function walk(root: string, rel: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const child = `${rel}/${e.name}`;
    // symlinks are deliberately skipped: they cannot be hashed honestly and
    // would let a devcontainer spec smuggle files from outside the repo.
    if (e.isDirectory()) walk(root, child, out);
    else if (e.isFile()) out.push(child);
  }
}

/**
 * The files this project's env spec is made of, sorted, or [] when the project
 * has no devcontainer. A bare `.devcontainer.json` and a `.devcontainer/`
 * directory can coexist; both travel, and the builder resolves them the way
 * the devcontainer CLI does.
 */
export function devcontainerFiles(root: string): string[] {
  const files: string[] = [];
  if (fs.existsSync(path.join(root, BARE_FILE))) files.push(BARE_FILE);
  walk(root, DEVCONTAINER_DIR, files);
  const sorted = files.sort();
  // A Dockerfile or a feature file alone is not a spec: something has to be a
  // devcontainer.json for the build to have an entry point.
  const hasManifest = sorted.some((f) => f === BARE_FILE || /(^|\/)devcontainer\.json$/.test(f));
  return hasManifest ? sorted : [];
}

/**
 * sha256 over `path \0 bytes \0` for each file in sorted order, first 16 hex.
 * Stable across machines: no mtimes, no modes, no tar framing — the same
 * devcontainer content always yields the same image tag, which is the whole
 * point of the cache.
 */
export function envHash(root: string, files: string[]): string {
  const h = createHash("sha256");
  for (const rel of [...files].sort()) {
    h.update(rel, "utf8");
    h.update("\0");
    h.update(fs.readFileSync(path.join(root, rel)));
    h.update("\0");
  }
  return h.digest("hex").slice(0, 16);
}

/**
 * Pack the env spec, or null when the project has no devcontainer.
 *
 * Throws (before anything has touched the network) when the payload is over
 * the 1 MiB API cap, naming the size — a fat `.devcontainer/` is almost always
 * a build artifact that was never meant to be in there.
 */
export function buildEnvSpec(root: string): EnvSpec | null {
  const files = devcontainerFiles(root);
  if (!files.length) return null;

  const tmp = path.join(os.tmpdir(), `stepaway-envspec-${process.pid}-${Date.now()}.tgz`);
  try {
    // Explicit file list from the repo root, so the archive holds exactly the
    // hashed paths. bash-3.2/BSD-tar safe: no --exclude, no --transform, no -T.
    const r = run("bash", ["-c", `set -e; exec tar czf ${shq(tmp)} ${files.map(shq).join(" ")}`], { cwd: root });
    if (r.code !== 0) {
      throw new Error(`could not pack ${DEVCONTAINER_DIR}: ${r.stderr.trim().split("\n").pop() || `tar exited ${r.code}`}`);
    }
    const raw = fs.readFileSync(tmp);
    const filesTgz = raw.toString("base64");
    if (filesTgz.length > ENVSPEC_MAX_BYTES) {
      throw new Error(
        `devcontainer spec is too large to ship: ${human(filesTgz.length)} of base64 tar.gz ` +
          `(limit ${human(ENVSPEC_MAX_BYTES)}, ${files.length} file(s), ${human(raw.length)} compressed). ` +
          `Keep build artifacts out of ${DEVCONTAINER_DIR}/, or set "image" in .stepaway.json to use a prebuilt image.`,
      );
    }
    return { hash: envHash(root, files), filesTgz, files, bytes: raw.length };
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** What the runner's environment will be, resolved per SPEC-v0.3 §"Env resolution order". */
export type RunnerEnv =
  | { kind: "image"; image: string }
  | { kind: "devcontainer"; spec: EnvSpec }
  | { kind: "generic" };

/**
 * First match wins: explicit `.stepaway.json` "image", else a devcontainer in
 * the repo, else the backend's generic runner image.
 *
 * `pack` is the only axis of variation: `push` needs the tarball (and wants an
 * oversized `.devcontainer/` to be a hard error before anything is created
 * anywhere), while `init` only reports what *would* happen, where packing is
 * both wasted work and the wrong place to fail. Either way the hash is real,
 * so both paths name the same environment.
 */
export function resolveRunnerEnv(
  root: string,
  image: string | null | undefined,
  opts: { pack?: boolean } = {},
): RunnerEnv {
  const explicit = typeof image === "string" ? image.trim() : "";
  if (explicit) return { kind: "image", image: explicit };
  if (opts.pack) {
    const spec = buildEnvSpec(root);
    return spec ? { kind: "devcontainer", spec } : { kind: "generic" };
  }
  const files = devcontainerFiles(root);
  if (!files.length) return { kind: "generic" };
  return { kind: "devcontainer", spec: { hash: envHash(root, files), filesTgz: "", files, bytes: 0 } };
}

/**
 * The single owner of the `environment:` string — the consent summary line and
 * `init`'s report are the same sentence by construction.
 */
export function describeRunnerEnv(plan: RunnerEnv): string {
  if (plan.kind === "image") return `image ${plan.image} (explicit)`;
  if (plan.kind === "devcontainer") {
    return `devcontainer (hash ${plan.spec.hash}, built+cached on the runner)`;
  }
  return "generic runner image";
}
