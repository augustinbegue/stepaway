import { renderLine } from "@stepaway/core";
import { openClient, projectRoot, readBaton } from "../config.js";
import { TranscriptPrinter } from "../transcript-format.js";

/**
 * Watch the agent work: `GET /transcript` (SSE with `-f`), rendered as
 * assistant prose plus one line per tool call. All the interesting logic lives
 * in transcript-format.ts and @stepaway/core — this command is just plumbing.
 */
export async function cmdPeek(args: string[], flags: Record<string, any>): Promise<number> {
  const root = projectRoot(args[0] ?? process.cwd());
  const baton = readBaton(root);
  const sessionId = flags.session ? String(flags.session) : baton?.id;
  if (!sessionId) {
    process.stderr.write(`no active handoff for ${root} (nothing to peek at)\n`);
    return 1;
  }
  const opened = openClient(root, flags, baton?.server);
  if (!opened.client) {
    process.stderr.write(`${opened.error}\n`);
    return 1;
  }
  const client = opened.client;
  const follow = Boolean(flags.follow);

  const printer = new TranscriptPrinter((s) => process.stdout.write(s), {
    color: Boolean(process.stdout.isTTY) && !flags.json,
    // follow mode streams: collapsing would hide a call until the run moved on
    collapse: !follow,
  });
  const emit = (line: string) => {
    for (const e of renderLine(line)) printer.push(e);
  };

  if (!follow) {
    let text: string;
    try {
      text = await client.transcript(sessionId);
    } catch (e) {
      process.stderr.write(`${(e as Error).message}\n`);
      return 1;
    }
    if (!text.trim()) {
      process.stderr.write(`no transcript yet for session ${sessionId}\n`);
      return 1;
    }
    for (const line of text.split("\n")) emit(line);
    printer.flush();
    return 0;
  }

  process.stderr.write(`peeking at ${client.server} (${sessionId.slice(0, 8)}) — ctrl-c to stop\n\n`);
  const ac = new AbortController();
  const stop = () => ac.abort();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    await client.followTranscript(sessionId, emit, { signal: ac.signal });
  } catch (e) {
    printer.flush();
    process.stderr.write(`${(e as Error).message}\n`);
    return 1;
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
  printer.flush();
  return 0;
}
