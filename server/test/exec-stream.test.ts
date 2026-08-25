/**
 * ExecSocket, the k8s channel-framing layer, against a fake WebSocket.
 *
 * The property under test is the one that /archive depends on: a streamed exec
 * that did NOT finish successfully must ERROR its ReadableStream. Closing it
 * cleanly turns a half-written `tar czf -` into a 200 with a body that gunzips
 * to garbage — silent data loss on the one path whose whole job is getting the
 * user's work back.
 */

import { describe, expect, test } from "bun:test";
import { ExecSocket, type ExecOpts } from "../src/k8s.js";

const CH_STDOUT = 1;
const CH_STDERR = 2;
const CH_ERROR = 3;

/** Just enough of the WebSocket surface for ExecSocket, driven by the test. */
class FakeWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: ArrayBuffer | string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly protocol = "v5.channel.k8s.io";
  bufferedAmount = 0;
  sent: Uint8Array[] = [];
  closedTimes = 0;

  send(data: Uint8Array): void {
    this.sent.push(data);
  }
  close(): void {
    this.closedTimes++;
  }

  open(): void {
    this.onopen?.();
  }
  frame(ch: number, payload: string): void {
    const bytes = new TextEncoder().encode(payload);
    const out = new Uint8Array(bytes.length + 1);
    out[0] = ch;
    out.set(bytes, 1);
    this.onmessage?.({ data: out.buffer as ArrayBuffer });
  }
  hangUp(): void {
    this.onclose?.();
  }
}

const SUCCESS = JSON.stringify({ status: "Success" });
const EXIT = (code: number) =>
  JSON.stringify({ status: "Failure", details: { causes: [{ reason: "ExitCode", message: String(code) }] } });

/** A stream fed by ExecSocket.pipeStdout, plus the fake socket driving it. */
function streamed(opts: ExecOpts = {}) {
  const ws = new FakeWebSocket();
  const sock = new ExecSocket(ws as unknown as WebSocket, opts);
  const stream = new ReadableStream<Uint8Array>({
    start: (controller) => sock.pipeStdout(controller),
    cancel: () => sock.cancel(),
  });
  return { ws, sock, stream };
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return chunks.map((c) => new TextDecoder().decode(c)).join("");
}

describe("execStream framing", () => {
  test("a completed exec streams stdout and closes cleanly", async () => {
    const { ws, stream } = streamed();
    ws.open();
    ws.frame(CH_STDOUT, "TAR");
    ws.frame(CH_STDOUT, "BYTES");
    ws.frame(CH_ERROR, SUCCESS);
    ws.hangUp();
    expect(await readAll(stream)).toBe("TARBYTES");
  });

  test("the remote dying mid-tar errors the stream instead of ending it", async () => {
    const { ws, stream } = streamed();
    ws.open();
    ws.frame(CH_STDOUT, "HALF-A-TAR");
    ws.hangUp(); // no channel-3 status: the connection dropped
    await expect(readAll(stream)).rejects.toThrow(/without a status frame/);
  });

  test("a non-zero remote exit errors the stream, with the stderr line", async () => {
    const { ws, stream } = streamed();
    ws.open();
    ws.frame(CH_STDOUT, "partial");
    ws.frame(CH_STDERR, "tar: /work/x: Cannot open\n");
    ws.frame(CH_ERROR, EXIT(2));
    ws.hangUp();
    await expect(readAll(stream)).rejects.toThrow(/exited 2: tar: \/work\/x: Cannot open/);
  });

  test("timeoutMs is enforced on the stream path, not silently ignored", async () => {
    const { ws, stream } = streamed({ timeoutMs: 20 });
    ws.open();
    ws.frame(CH_STDOUT, "slow");
    // never a status, never a close: exactly the hang the timeout exists for.
    await expect(readAll(stream)).rejects.toThrow(/timed out after 20ms/);
    expect(ws.closedTimes).toBeGreaterThan(0);
  });

  test("a cancelled stream is not an error (the client just left)", async () => {
    const { ws, sock, stream } = streamed();
    ws.open();
    const reader = stream.getReader();
    ws.frame(CH_STDOUT, "x");
    expect(new TextDecoder().decode((await reader.read()).value!)).toBe("x");
    await reader.cancel();
    expect(ws.closedTimes).toBeGreaterThan(0);
    sock.cancel();
    ws.hangUp(); // must not throw
  });
});

describe("exec (buffered) shares the same dispatch loop", () => {
  test("a non-zero exit is data, not a rejection", async () => {
    const ws = new FakeWebSocket();
    const sock = new ExecSocket(ws as unknown as WebSocket, {});
    const p = sock.collect();
    ws.open();
    ws.frame(CH_STDOUT, "out");
    ws.frame(CH_STDERR, "boom");
    ws.frame(CH_ERROR, EXIT(3));
    ws.hangUp();
    expect(await p).toEqual({ code: 3, stdout: "out", stderr: "boom" });
  });

  test("a missing status frame is exit 255, never a phantom success", async () => {
    const ws = new FakeWebSocket();
    const sock = new ExecSocket(ws as unknown as WebSocket, {});
    const p = sock.collect();
    ws.open();
    ws.hangUp();
    expect((await p).code).toBe(255);
  });

  test("timeoutMs rejects", async () => {
    const ws = new FakeWebSocket();
    const sock = new ExecSocket(ws as unknown as WebSocket, { timeoutMs: 20 });
    const p = sock.collect();
    ws.open();
    await expect(p).rejects.toThrow(/timed out after 20ms/);
  });

  test("stdin is half-closed on v5 so the status frame still arrives", async () => {
    const ws = new FakeWebSocket();
    const sock = new ExecSocket(ws as unknown as WebSocket, { stdin: "hello" });
    const p = sock.collect();
    ws.open();
    await Bun.sleep(1);
    expect(ws.closedTimes).toBe(0);
    expect(ws.sent).toHaveLength(2);
    expect(ws.sent[1]).toEqual(new Uint8Array([255, 0]));
    ws.frame(CH_ERROR, SUCCESS);
    ws.hangUp();
    expect((await p).code).toBe(0);
  });
});
