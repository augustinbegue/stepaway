/**
 * Frozen v1 API contract (SPEC-v0.2.md §3). Shared by server (implements) and
 * cli / future web UI (consume). Pure types + route constants — no I/O here.
 *
 * All endpoints except /v1/healthz require `Authorization: Bearer <token>`.
 * Errors are JSON: { error, detail? } with a matching HTTP status.
 */

export const API_PREFIX = "/v1";

/** Server-derived run state — the UI's core field. */
export type SessionState =
  | "pending" // pod/PVC created, runner still booting
  | "restoring" // capture upload accepted, restore/setup in progress
  | "ready" // runner up, no run launched (or restore finished, run not started)
  | "running" // unattended run in progress
  | "done" // run exited 0
  | "failed"; // run exited non-zero, or restore/setup hard-failed

export interface Session {
  id: string; // full session id (uuid from the Claude transcript)
  project: string; // project basename, e.g. "car-mod-viz"
  state: SessionState;
  podName: string; // stepaway-<sid8>
  createdAt: string; // ISO 8601
  /** Present when state is done/failed. */
  exitCode?: number | null;
  /** Human detail for failed states (last error line, never env values). */
  detail?: string;
}

export interface CreateSessionRequest {
  sessionId: string;
  project: string;
  /** Optional overrides within what the server template allows. */
  options?: {
    /** Remote path base, default /work. */
    remotePathBase?: string;
  };
}

export interface RunRequest {
  /** The user's goal, or the default orient-then-continue instruction. */
  instruction: string;
  /** Commit-locally guidance; server has a default. */
  appendSystemPrompt?: string;
}

/** Response of POST /sessions/:id/capture (after server-side restore+setup). */
export interface CaptureReport {
  restored: boolean;
  gitDir: string;
  workTree: string;
  branch: string;
  docker: { attempted: boolean; ok: boolean; detail?: string };
  setup: { attempted: boolean; ok: boolean; cmd?: string; tail?: string };
}

export interface EnvNamesResponse {
  /** Subset of the queried names that the runner environment satisfies. */
  satisfied: string[];
}

export interface DiagnosticCheck {
  name: string;
  ok: boolean;
  /** "warn" = non-blocking. */
  level: "pass" | "warn" | "fail";
  detail?: string;
}

export interface DiagnosticsResponse {
  checks: DiagnosticCheck[];
  ok: boolean; // no "fail" level checks
}

export interface VersionResponse {
  version: string; // package version, shared across the monorepo
  api: "v1";
}

export interface ClaudeTokenRequest {
  token: string; // sk-ant-oat…, stored server-side as a k8s Secret
}

export interface ApiError {
  error: string;
  detail?: string;
}

// ---------------------------------------------------------------------------
// v1.1 additive
//
// Response shapes that v1 implemented but never declared. Additive only: no
// field here is new on the wire, so a v1 client keeps working unchanged.
// ---------------------------------------------------------------------------

/** Response of POST /sessions/:id/run. */
export interface RunResponse {
  ok: true;
  /** How the run was started, e.g. "tmux session 'stepaway'". */
  how: string;
  /** Absolute path of the run log inside the runner. */
  log: string;
  /** Permission flags the server picked for the installed CLI. */
  permissionFlags: string[];
  /** Set when the server had to fall back to a weaker permission mode. */
  warn?: string;
  state: SessionState;
}

/** Response of DELETE /sessions/:id. */
export interface DeleteSessionResponse {
  ok: true;
  podName: string;
}

/** Response of PUT /claude-token. */
export interface ClaudeTokenResponse {
  ok: true;
  /** Name of the k8s Secret the token landed in. */
  secret: string;
}

/** Route table (path templates, `:id` = session id). */
export const ROUTES = {
  sessions: `${API_PREFIX}/sessions`,
  session: (id: string) => `${API_PREFIX}/sessions/${id}`,
  capture: (id: string) => `${API_PREFIX}/sessions/${id}/capture`,
  run: (id: string) => `${API_PREFIX}/sessions/${id}/run`,
  transcript: (id: string) => `${API_PREFIX}/sessions/${id}/transcript`,
  archive: (id: string) => `${API_PREFIX}/sessions/${id}/archive`,
  envNames: (id: string) => `${API_PREFIX}/sessions/${id}/env-names`,
  claudeToken: `${API_PREFIX}/claude-token`,
  diagnostics: `${API_PREFIX}/diagnostics`,
  healthz: `${API_PREFIX}/healthz`,
  version: `${API_PREFIX}/version`,
} as const;
