/**
 * Terminal formatting for transcript events.
 *
 * Split from src/transcript.ts on purpose: renderLine() is pure data (the web
 * UI will consume it directly), and everything ANSI lives here.
 */
import pc from "picocolors";
import type { TranscriptEvent } from "@stepaway/core";

export type FormatOptions = {
  /** false disables every escape sequence (pipes, --json, tests). */
  color?: boolean;
  /** follow mode streams; there is nothing to collapse yet. */
  collapse?: boolean;
};

/* ------------------------------------------------------------------ markdown */

/**
 * Just enough markdown for a terminal: headings and **bold** become bold,
 * single-asterisk and underscore emphasis become bold too (real italics are
 * unreliable over ssh and tmux),
 * `code` becomes dim cyan, list bullets keep their indent.
 *
 * Deliberately line-oriented and tiny — no parser, no dependency. Fenced code
 * blocks pass through verbatim so nothing inside them is mangled.
 */
export function renderMarkdown(text: string, color = true): string {
  const bold = (s: string) => (color ? pc.bold(s) : s);
  const code = (s: string) => (color ? pc.cyan(pc.dim(s)) : s);

  const out: string[] = [];
  let fenced = false;
  for (const raw of text.split("\n")) {
    if (/^\s*```/.test(raw)) {
      fenced = !fenced;
      out.push(color ? pc.dim(raw) : raw);
      continue;
    }
    if (fenced) {
      out.push(color ? pc.dim(raw) : raw);
      continue;
    }
    const h = /^(\s*)(#{1,6})\s+(.*)$/.exec(raw);
    if (h) {
      out.push(`${h[1]}${bold(h[3])}`);
      continue;
    }
    out.push(inline(raw, bold, code));
  }
  return out.join("\n");
}

/**
 * Inline spans on one line, in order: code spans first (so emphasis rules never
 * fire inside them), then double-marker bold, then single-marker emphasis.
 */
function inline(line: string, bold: (s: string) => string, code: (s: string) => string): string {
  // split on backticks so emphasis rules never fire inside code spans
  const parts = line.split(/(`[^`]+`)/g);
  return parts
    .map((part) => {
      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return code(part.slice(1, -1));
      let s = part;
      s = s.replace(/\*\*([^*\n]+)\*\*/g, (_m, g) => bold(g));
      s = s.replace(/__([^_\n]+)__/g, (_m, g) => bold(g));
      s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s.,;:)!?])/g, (_m, pre, g) => `${pre}${bold(g)}`);
      s = s.replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,;:)!?])/g, (_m, pre, g) => `${pre}${bold(g)}`);
      return s;
    })
    .join("");
}

/* -------------------------------------------------------------- one event */

/** One display line (or block) per event, ANSI included. */
export function formatEvent(e: TranscriptEvent, opts: FormatOptions = {}): string {
  const color = opts.color !== false;
  const dim = (s: string) => (color ? pc.dim(s) : s);
  switch (e.kind) {
    case "tool-use": {
      const name = e.tool ?? e.text;
      const summary = e.summary ? `  ${e.summary}` : "";
      return dim(`⚙ ${name}${summary}`);
    }
    case "result":
      return dim(`— ${e.text}`);
    case "error":
      return color ? pc.red(`! ${e.text}`) : `! ${e.text}`;
    default:
      return renderMarkdown(e.text, color);
  }
}

/* ------------------------------------------------------------- the printer */

const COLLAPSE_AT = 5;
const COLLAPSE_KEEP = 3;

/**
 * Stateful renderer for a stream of events.
 *
 * Two things it does that a per-event formatter cannot: collapse long runs of
 * tool calls (5+ becomes "first 3, … +N more"), and put a blank line between
 * turns. In follow mode collapsing is off — you want to see the tool call the
 * moment it happens, not N seconds later.
 */
export class TranscriptPrinter {
  private pending: TranscriptEvent[] = [];
  private lastKind: string | null = null;

  constructor(
    private readonly write: (s: string) => void,
    private readonly opts: FormatOptions = {},
  ) {}

  push(e: TranscriptEvent): void {
    if (this.opts.collapse === false) {
      this.emit(e);
      return;
    }
    if (e.kind === "tool-use") {
      this.pending.push(e);
      return;
    }
    this.flush();
    this.emit(e);
  }

  /** Emit any buffered tool calls. Call once at end of stream. */
  flush(): void {
    const p = this.pending;
    this.pending = [];
    if (!p.length) return;
    if (p.length < COLLAPSE_AT) {
      for (const e of p) this.emit(e);
      return;
    }
    for (const e of p.slice(0, COLLAPSE_KEEP)) this.emit(e);
    const n = p.length - COLLAPSE_KEEP;
    const line = `… +${n} more tool call${n === 1 ? "" : "s"}`;
    this.write(`${this.opts.color === false ? line : pc.dim(line)}\n`);
    this.lastKind = "tool-use";
  }

  private emit(e: TranscriptEvent): void {
    // a blank line between turns: prose gets air, consecutive tool calls do not
    if (this.lastKind && (e.kind === "assistant-text" || this.lastKind === "assistant-text")) {
      this.write("\n");
    }
    this.write(`${formatEvent(e, this.opts)}\n`);
    this.lastKind = e.kind;
  }
}
