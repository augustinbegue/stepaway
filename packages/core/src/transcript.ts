/**
 * Transcript reader — line in, rendered events out.
 *
 * Deliberately standalone and dependency-free: `peek` is merely its first
 * consumer, the web UI is the second. Nothing in here knows about kubectl,
 * files, or terminals — and in particular nothing in here emits ANSI. All
 * formatting lives in src/transcript-format.ts.
 */

export type EventKind = "assistant-text" | "tool-use" | "result" | "error";
export type EventLevel = "info" | "detail" | "error";

export type TranscriptEvent = {
  kind: EventKind;
  /** severity hint for consumers that style or filter (CLI, web UI). */
  level: EventLevel;
  /** assistant prose verbatim, or the tool name, or a short result line. */
  text: string;
  /** tool-use only: the tool's name. */
  tool?: string;
  /** tool-use only: a short, human-readable summary of the tool input. */
  summary?: string;
  timestamp?: string;
};

function contentBlocks(obj: any): any[] {
  const c = obj?.message?.content ?? obj?.content;
  if (Array.isArray(c)) return c;
  if (typeof c === "string") return [{ type: "text", text: c }];
  return [];
}

/** Lines Claude Code emits as bookkeeping, never worth showing in a peek. */
const NOISE = /^no response requested\.?$/i;

/**
 * The input fields worth showing, most informative first. The first one present
 * and non-empty becomes the tool-call summary.
 */
const SUMMARY_FIELDS = [
  "command",
  "file_path",
  "path",
  "pattern",
  "url",
  "query",
  "prompt",
  "description",
  "notebook_path",
  "subagent_type",
];

const SUMMARY_MAX = 60;

/** One short line describing what a tool call is actually doing. */
export function toolSummary(input: any): string {
  if (!input || typeof input !== "object") return "";
  for (const f of SUMMARY_FIELDS) {
    const v = (input as any)[f];
    if (typeof v === "string" && v.trim()) return clip(v, SUMMARY_MAX);
    if (typeof v === "number") return String(v);
  }
  // nothing recognised: fall back to the first short string field
  for (const v of Object.values(input as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim() && v.length <= 120) return clip(v, SUMMARY_MAX);
  }
  return "";
}

function clip(s: string, n: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length <= n ? one : one.slice(0, n - 1) + "…";
}

/**
 * Parse one JSONL line into zero or more events.
 *
 * Shown: assistant prose (verbatim) and one line per tool call. Skipped: user
 * turns, tool results, queue/system bookkeeping — a peek is for watching the
 * agent think, not for replaying payloads.
 */
export function renderLine(line: string): TranscriptEvent[] {
  const s = line.trim();
  if (!s) return [];
  let obj: any;
  try {
    obj = JSON.parse(s);
  } catch {
    return [];
  }
  const ts = typeof obj?.timestamp === "string" ? obj.timestamp : undefined;

  if (obj?.type === "assistant") {
    const out: TranscriptEvent[] = [];
    for (const b of contentBlocks(obj)) {
      if (b?.type === "text" && typeof b.text === "string" && b.text.trim()) {
        const text = b.text.trim();
        if (NOISE.test(text)) continue;
        out.push({ kind: "assistant-text", level: "info", text, timestamp: ts });
      } else if (b?.type === "tool_use") {
        const tool = String(b.name ?? "tool");
        const summary = toolSummary(b.input);
        out.push({
          kind: "tool-use",
          level: "detail",
          text: summary ? `${tool}  ${summary}` : tool,
          tool,
          summary,
          timestamp: ts,
        });
      }
    }
    return out;
  }

  if (obj?.type === "result") {
    const sub = typeof obj.subtype === "string" ? obj.subtype : "done";
    if (obj.is_error) return [{ kind: "error", level: "error", text: `run ended: ${sub}`, timestamp: ts }];
    return [{ kind: "result", level: "info", text: `run ended: ${sub}`, timestamp: ts }];
  }

  return [];
}
