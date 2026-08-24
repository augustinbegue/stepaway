/**
 * Claude Code session bookkeeping: project-path slugs, choosing which
 * transcript travels, and the transcript rewrite that makes it resumable at the
 * destination path.
 *
 * All pure. The caller supplies the directory listing (it knows whether it is
 * looking at a laptop HOME or a runner's), and writes the result back.
 */

/** Slug used by Claude Code for a project path. */
export function slugFor(projectPath: string): string {
  return projectPath.replace(/[/.]/g, "-");
}

/**
 * Every spelling a Claude Code version might have used for this path, most
 * likely first. Mirrors the SLUG loop in CAPTURE_SH: the caller keeps the first
 * candidate that exists under ~/.claude/projects.
 */
export function slugCandidates(projectPath: string): string[] {
  return [
    projectPath.replace(/[/.]/g, "-"),
    projectPath.replace(/\//g, "-"),
    projectPath.replace(/[^a-zA-Z0-9]/g, "-"),
  ];
}

export type SessionEntry = { id: string; mtimeMs: number };

/**
 * The session a push will carry: `want` if it exists, else the
 * most-recently-modified transcript. Resolved BEFORE capture because the pod is
 * named after it.
 */
export function selectSessionFrom(entries: SessionEntry[], want?: string | null): string | null {
  if (want) return entries.some((e) => e.id === want) ? want : null;
  let best: string | null = null;
  let bestT = -1;
  for (const e of entries) {
    if (e.mtimeMs > bestT) {
      bestT = e.mtimeMs;
      best = e.id;
    }
  }
  return best;
}

/** Turns left by a failed `--resume`, which must not be replayed (POC.md). */
const PHANTOM_TEXTS = new Set(["Continue from where you left off.", "No response requested."]);

function messageText(obj: any): string | null {
  const content = obj?.message?.content ?? obj?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    const texts = content
      .filter((c: any) => c && (c.type === "text" || typeof c.text === "string"))
      .map((c: any) => String(c.text ?? ""));
    if (texts.length === content.length && texts.length > 0) return texts.join("").trim();
  }
  return null;
}

/**
 * Rewrite one transcript for a new project path:
 *   - replaces the source absolute path with the target path (raw + JSON-escaped);
 *   - trims trailing phantom turns.
 * Returns the new body and how many lines were trimmed.
 */
export function rewriteTranscript(content: string, srcPath: string, dstPath: string): { text: string; trimmed: number } {
  let text = content;
  if (srcPath !== dstPath) {
    text = text.split(JSON.stringify(srcPath).slice(1, -1)).join(JSON.stringify(dstPath).slice(1, -1));
    text = text.split(srcPath).join(dstPath);
  }
  const lines = text.split("\n");
  // keep a trailing-newline marker off the array while trimming
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  let trimmed = 0;
  while (lines.length > 0) {
    const last = lines[lines.length - 1];
    if (!last.trim()) {
      lines.pop();
      continue;
    }
    let obj: any;
    try {
      obj = JSON.parse(last);
    } catch {
      break;
    }
    const t = messageText(obj);
    if (t !== null && PHANTOM_TEXTS.has(t)) {
      lines.pop();
      trimmed++;
      continue;
    }
    break;
  }
  return { text: lines.length ? lines.join("\n") + "\n" : "", trimmed };
}
