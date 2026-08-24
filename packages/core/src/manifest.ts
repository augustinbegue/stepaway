/**
 * manifest.json — the shape of the capture summary, and the pure composer that
 * turns the raw facts written by CAPTURE_SH into it.
 *
 * Reading the meta/ files and writing manifest.json are the caller's job (the
 * CLI on the laptop, the backend in the cluster); this module only does the
 * arithmetic, so both sides produce byte-identical manifests.
 */

export type CarriedEnvFile = { path: string; vars: number };

export type DockerManifest = {
  compose_file: string;
  project: string;
  containers: { name: string; image: string; digest: string }[];
  volumes: { name: string; bytes: number }[];
  refused: string[];
  orphans: string[];
};

export type Manifest = {
  captured: {
    project_path: string;
    slug: string;
    branch: string;
    head: string;
    claude_version: string;
    session_ids: string[];
    dirty_file_count: number;
    largest_dirty_files: { path: string; bytes: number }[];
    /** names + var counts only — never values. */
    env_files: CarriedEnvFile[];
    docker: DockerManifest | null;
  };
  not_captured: {
    gitignored_files: number;
    running_processes: boolean;
    env: { required_variables: string[]; unsatisfied_variables: string[]; skipped_env_files: string[] };
    local_services: boolean;
    databases: boolean;
    orphan_containers: string[];
    refused_containers: string[];
    docker_volumes_never_return: boolean;
  };
};

/** Decisions the client makes after capture (env picker, docker consent). */
export type ManifestExtras = {
  envFiles?: CarriedEnvFile[];
  unsatisfied?: string[];
  skippedEnvFiles?: string[];
  docker?: DockerManifest | null;
};

/**
 * The raw facts CAPTURE_SH leaves in the capture dir, already read off disk.
 * Field names map 1:1 onto meta/ files (plus the sessions/ listing).
 */
export type CaptureFacts = {
  /** meta/project-path */
  projectPath: string;
  /** meta/slug */
  slug: string;
  /** meta/branch */
  branch: string;
  /** meta/head, "none" when there is no commit */
  head: string;
  /** meta/claude-version */
  claudeVersion: string;
  /** basenames of sessions/*.jsonl without the extension */
  sessionIds: string[];
  /** non-empty lines of dirty-files.txt */
  dirtyFiles: string[];
  /** raw "<bytes>\t<path>" lines of meta/largest-dirty.txt */
  largestDirty: string[];
  /** meta/ignored-count */
  ignoredCount: number;
  /** meta/required-vars.txt */
  requiredVars: string[];
  /** meta/declared-env-files.txt */
  declaredEnvFiles: string[];
};

/** Parse one "<bytes>\t<path>" line from meta/largest-dirty.txt. */
export function parseLargestDirty(line: string): { path: string; bytes: number } {
  const [bytes, ...rest] = line.split("\t");
  return { path: rest.join("\t"), bytes: Number(bytes) || 0 };
}

/** Compose manifest.json from the raw meta/ facts plus the client's decisions. */
export function composeManifest(f: CaptureFacts, extras: ManifestExtras = {}): Manifest {
  const carried = extras.envFiles ?? [];
  const carriedSet = new Set(carried.map((c) => c.path));
  return {
    captured: {
      project_path: f.projectPath,
      slug: f.slug,
      branch: f.branch,
      head: f.head,
      claude_version: f.claudeVersion,
      session_ids: f.sessionIds,
      dirty_file_count: f.dirtyFiles.length,
      largest_dirty_files: f.largestDirty.map(parseLargestDirty),
      env_files: carried,
      docker: extras.docker ?? null,
    },
    not_captured: {
      gitignored_files: f.ignoredCount,
      running_processes: true,
      env: {
        required_variables: f.requiredVars,
        unsatisfied_variables: extras.unsatisfied ?? [],
        skipped_env_files: extras.skippedEnvFiles ?? f.declaredEnvFiles.filter((d) => !carriedSet.has(d)),
      },
      local_services: true,
      databases: true,
      orphan_containers: extras.docker?.orphans ?? [],
      refused_containers: extras.docker?.refused ?? [],
      docker_volumes_never_return: true,
    },
  };
}

/** The (single) transcript a capture carries. */
export function capturedSessionId(m: Manifest): string | null {
  return m.captured.session_ids[0] ?? null;
}
