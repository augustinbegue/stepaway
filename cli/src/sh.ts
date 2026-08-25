import { spawn, spawnSync } from "node:child_process";

export type RunResult = { code: number; stdout: string; stderr: string };

export function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; input?: string; env?: NodeJS.ProcessEnv } = {},
): RunResult {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    input: opts.input,
    env: opts.env ?? process.env,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.error) return { code: 127, stdout: "", stderr: String(r.error.message) };
  return {
    code: r.status ?? 1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

/**
 * Non-blocking twin of run(), same RunResult shape.
 *
 * spawnSync freezes the event loop for the whole child, which means no timer
 * fires and a clack spinner never draws a single frame — on a 500 MB project
 * `push` looked hung for minutes. Every long phase (tar, capture, docker
 * quiesce) goes through here so the UI keeps ticking; short sub-second calls can
 * stay sync, where the overhead of a promise is not worth it.
 */
export function runAsync(
  cmd: string,
  args: string[],
  opts: { cwd?: string; input?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: [opts.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    // run() has spawnSync's maxBuffer; do the same here, but keep the TAIL —
    // callers report the last line of a failure, never the first.
    const cap = 64 * 1024 * 1024;
    const sink = () => {
      const bufs: Buffer[] = [];
      let size = 0;
      return {
        push(c: Buffer) {
          bufs.push(c);
          size += c.length;
          while (size > cap && bufs.length > 1) size -= bufs.shift()!.length;
        },
        text: () => Buffer.concat(bufs).toString("utf8"),
      };
    };
    const out = sink();
    const err = sink();
    child.stdout?.on("data", (c: Buffer) => out.push(c));
    child.stderr?.on("data", (c: Buffer) => err.push(c));
    let settled = false;
    const done = (r: RunResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    child.on("error", (e) => done({ code: 127, stdout: "", stderr: String(e.message) }));
    child.on("close", (code) =>
      done({
        code: code ?? 1,
        stdout: out.text(),
        stderr: err.text(),
      }),
    );
    if (opts.input !== undefined && child.stdin) {
      child.stdin.on("error", () => {
        /* the child may exit before it drains stdin; the exit code is the news */
      });
      child.stdin.end(opts.input);
    }
  });
}

/**
 * Run a bash script locally, without blocking the event loop. Extra args land
 * in $1.. of the script.
 */
export function bashAsync(
  script: string,
  args: string[] = [],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<RunResult> {
  return runAsync("bash", ["-c", script, "stepaway", ...args], opts);
}

/**
 * Errors from local and remote scripts alike can be pages long; the last
 * non-empty line is the news. Single implementation — every caller uses it.
 */
export function lastLine(s: string): string {
  const lines = s.trim().split("\n").filter((l) => l.trim());
  return lines.length ? lines[lines.length - 1] : "(no output)";
}

export function which(bin: string): boolean {
  return run("bash", ["-lc", `command -v ${shq(bin)} >/dev/null 2>&1`]).code === 0;
}

/** POSIX single-quote shell escaping. */
export function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Spawn a child, streaming its stdout line-by-line to a callback. Used by
 * `peek -f`, the one code path that cannot use the spawnSync-based run().
 */
export function spawnStream(
  cmd: string,
  args: string[],
  onLine: (line: string) => void,
  opts: { onStderr?: (chunk: string) => void } = {},
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let buf = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buf += chunk;
      let i: number;
      while ((i = buf.indexOf("\n")) !== -1) {
        onLine(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    });
    if (opts.onStderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", opts.onStderr);
    } else {
      child.stderr.resume();
    }
    const done = (code: number) => {
      if (buf.trim()) onLine(buf);
      buf = "";
      resolve(code);
    };
    child.on("error", () => done(127));
    child.on("close", (code) => done(code ?? 1));
    const stop = () => {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}

/**
 * Byte sizes for humans. Binary units throughout (KiB/MiB/GiB/TiB), because
 * every limit stepaway prints next to one — the 1 MiB envSpec cap most of all —
 * is a power of two, and "1.00 MiB" next to "limit 1.00 MiB" is the only
 * rendering that does not look like a rounding bug.
 *
 * The single formatter in the CLI: sizes are compared across capture, docker
 * and envspec output, so they must all read the same.
 */
export function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let b = bytes / 1024;
  let i = 0;
  while (b >= 1024 && i < units.length - 1) {
    b /= 1024;
    i++;
  }
  // whole KiB (sub-KiB precision is noise); two decimals from MiB up.
  return i === 0 ? `${Math.round(b)} KiB` : `${b.toFixed(2)} ${units[i]}`;
}
