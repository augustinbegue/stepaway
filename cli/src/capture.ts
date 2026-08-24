import * as fs from "node:fs";
import * as path from "node:path";
import {
  CAPTURE_SH,
  composeManifest,
  rewriteTranscript,
  selectSessionFrom,
  slugCandidates,
  type CaptureFacts,
  type Manifest,
  type ManifestExtras,
} from "@stepaway/core";
import { bashAsync, type RunResult } from "./sh.js";

/**
 * Laptop-side capture: run CAPTURE_SH, then read the meta/ facts it leaves
 * behind. The script itself, the manifest shape and the composer are in
 * @stepaway/core so the backend produces identical manifests; everything that
 * touches this filesystem or spawns a process stays here.
 */

function readMeta(dir: string, name: string, dflt = ""): string {
  try {
    return fs.readFileSync(path.join(dir, "meta", name), "utf8").trim();
  } catch {
    return dflt;
  }
}

export function readLines(dir: string, rel: string): string[] {
  try {
    return fs
      .readFileSync(path.join(dir, rel), "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Read the raw facts CAPTURE_SH wrote into a capture dir. */
export function readCaptureFacts(captureDir: string): CaptureFacts {
  const sessionsDir = path.join(captureDir, "sessions");
  const sessionIds = fs.existsSync(sessionsDir)
    ? fs
        .readdirSync(sessionsDir)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => f.replace(/\.jsonl$/, ""))
        .sort()
    : [];
  return {
    projectPath: readMeta(captureDir, "project-path"),
    slug: readMeta(captureDir, "slug"),
    branch: readMeta(captureDir, "branch"),
    head: readMeta(captureDir, "head", "none"),
    claudeVersion: readMeta(captureDir, "claude-version", "unknown"),
    sessionIds,
    dirtyFiles: readLines(captureDir, "dirty-files.txt"),
    largestDirty: readLines(captureDir, "meta/largest-dirty.txt"),
    ignoredCount: Number(readMeta(captureDir, "ignored-count", "0")) || 0,
    requiredVars: readLines(captureDir, "meta/required-vars.txt"),
    declaredEnvFiles: readLines(captureDir, "meta/declared-env-files.txt"),
  };
}

/** Compose manifest.json from the raw meta/ facts and write it into the capture dir. */
export function buildManifest(captureDir: string, extras: ManifestExtras = {}): Manifest {
  const m = composeManifest(readCaptureFacts(captureDir), extras);
  fs.writeFileSync(path.join(captureDir, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
  return m;
}

export function readManifest(captureDir: string): Manifest {
  return JSON.parse(fs.readFileSync(path.join(captureDir, "manifest.json"), "utf8")) as Manifest;
}

/** Capture the local project into outDir. manifest.json is composed separately
 *  (push enriches it with the env/docker decisions before writing it). */
export async function captureLocal(
  projectDir: string,
  outDir: string,
  opts: { sessionId?: string | null; excludes?: string[]; composeFile?: string | null } = {},
): Promise<void> {
  fs.mkdirSync(outDir, { recursive: true });
  const env = {
    ...process.env,
    STEPAWAY_EXCLUDES: (opts.excludes ?? []).join("\n"),
    STEPAWAY_COMPOSE_FILE: opts.composeFile ?? "",
  };
  // async: this bundles the repo and tars the dirty tree — minutes on a big
  // project, and spawnSync would freeze the spinner for all of it
  const r: RunResult = await bashAsync(CAPTURE_SH, [projectDir, outDir, opts.sessionId ?? ""], { env });
  if (r.code !== 0) throw new Error(`capture failed:\n${r.stderr.trim() || r.stdout.trim()}`);
}

/** Pick the slug directory that actually exists under ~/.claude/projects, if any. */
export function existingSlugDir(home: string, projectPath: string): string | null {
  for (const c of slugCandidates(projectPath)) {
    if (fs.existsSync(path.join(home, ".claude", "projects", c))) return c;
  }
  return null;
}

/**
 * The session that push will carry: `--session` if given, else the
 * most-recently-modified transcript in the project's slug dir. Resolved BEFORE
 * capture because the pod is named after it.
 */
export function selectSession(home: string, projectPath: string, want?: string | null): string | null {
  const slug = existingSlugDir(home, projectPath);
  if (!slug) return null;
  const dir = path.join(home, ".claude", "projects", slug);
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return null;
  }
  const listed = entries.flatMap((f) => {
    try {
      return [{ id: f.replace(/\.jsonl$/, ""), mtimeMs: fs.statSync(path.join(dir, f)).mtimeMs }];
    } catch {
      return [];
    }
  });
  return selectSessionFrom(listed, want);
}

/**
 * Rewrite session transcripts for a new project path, in place in the capture
 * dir (path substitution + phantom-tail trim live in @stepaway/core).
 * Returns the number of trimmed lines.
 */
export function rewriteSessions(
  captureDir: string,
  srcPath: string,
  dstPath: string,
): { files: number; trimmed: number } {
  const dir = path.join(captureDir, "sessions");
  if (!fs.existsSync(dir)) return { files: 0, trimmed: 0 };
  let trimmed = 0;
  let files = 0;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
    const p = path.join(dir, f);
    const out = rewriteTranscript(fs.readFileSync(p, "utf8"), srcPath, dstPath);
    fs.writeFileSync(p, out.text);
    trimmed += out.trimmed;
    files++;
  }
  return { files, trimmed };
}
