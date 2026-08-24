/**
 * Presentation layer.
 *
 * Two modes, one API:
 *   - fancy: a TTY, no --yes / --json — clack prompts, spinners, colour.
 *   - plain: everything else (pipes, CI, the Claude Code skill) — one line per
 *     phase on stderr, exactly the shape v0.1 printed.
 *
 * Nothing here ever *requires* a TTY: every prompt has a non-interactive
 * answer, and every spinner degrades to a single line.
 */
import * as clack from "@clack/prompts";
import pc from "picocolors";

export type UiOptions = {
  /** show per-phase detail (server reports, restore chatter, stacks). */
  verbose?: boolean;
  /** force plain output regardless of the terminal. */
  plain?: boolean;
};

export type Spin = {
  /** replace the spinner label mid-phase. */
  update(message: string): void;
  /** finish successfully. */
  stop(message?: string): void;
  /** finish in an error state (spinner turns red). */
  fail(message: string): void;
};

const isTTYOut = (): boolean => Boolean(process.stdout.isTTY);

export class Ui {
  readonly verbose: boolean;
  readonly fancy: boolean;
  private started = false;

  constructor(opts: UiOptions = {}) {
    this.verbose = Boolean(opts.verbose);
    this.fancy = !opts.plain && isTTYOut();
  }

  /** Build the Ui a command should use, from its parsed flags. */
  static from(flags: Record<string, any>): Ui {
    return new Ui({ verbose: Boolean(flags.verbose), plain: Boolean(flags.yes || flags.json) });
  }

  // ---------------------------------------------------------------- framing

  intro(title: string): void {
    this.started = true;
    if (this.fancy) clack.intro(pc.bgCyan(pc.black(` ${title} `)));
    else process.stderr.write(`${title}\n`);
  }

  outro(message: string): void {
    if (this.fancy && this.started) clack.outro(message);
    else process.stdout.write(`${message}\n`);
  }

  // ---------------------------------------------------------------- messages

  /** Phase-level progress. Always shown. */
  step(message: string): void {
    if (this.fancy) clack.log.step(message);
    else process.stderr.write(`${message}\n`);
  }

  success(message: string): void {
    if (this.fancy) clack.log.success(pc.green(message));
    else process.stderr.write(`${message}\n`);
  }

  info(message: string): void {
    if (this.fancy) clack.log.info(message);
    else process.stderr.write(`${message}\n`);
  }

  /** Secondary detail: dim in fancy mode, hidden entirely unless --verbose. */
  detail(message: string): void {
    if (!this.verbose) return;
    const text = message.replace(/\n+$/, "");
    if (!text) return;
    if (this.fancy) clack.log.message(pc.dim(text));
    else process.stderr.write(`${text}\n`);
  }

  warn(message: string): void {
    if (this.fancy) clack.log.warn(pc.yellow(message));
    else process.stderr.write(`warning: ${message}\n`);
  }

  /** A single red line plus an optional suggestion. Stacks only with --verbose. */
  error(message: string, suggestion?: string): void {
    if (this.fancy) {
      clack.log.error(pc.red(message));
      if (suggestion) clack.log.message(pc.dim(suggestion));
    } else {
      process.stderr.write(`${message}\n`);
      if (suggestion) process.stderr.write(`${suggestion}\n`);
    }
  }

  /** A pre-formatted multi-line block (the consent contract, doctor's table). */
  note(body: string, title?: string): void {
    if (this.fancy) clack.note(body, title);
    else process.stdout.write((title ? `${title}\n` : "") + body + "\n");
  }

  /** Straight to stdout, unstyled — for --json and other machine output. */
  raw(text: string): void {
    process.stdout.write(text);
  }

  cancel(message: string): void {
    if (this.fancy) clack.cancel(message);
    else process.stderr.write(`${message}\n`);
  }

  // ---------------------------------------------------------------- spinners

  /**
   * Start a phase. In fancy mode a clack spinner with an elapsed-time
   * indicator; otherwise a single line now and a single line at stop().
   */
  spinner(label: string): Spin {
    if (!this.fancy) {
      process.stderr.write(`${label}\n`);
      return {
        update: (m) => {
          if (this.verbose) process.stderr.write(`${m}\n`);
        },
        stop: (m) => {
          if (m) process.stderr.write(`${m}\n`);
        },
        fail: (m) => process.stderr.write(`${m}\n`),
      };
    }
    const s = clack.spinner({ indicator: "timer" });
    s.start(label);
    let done = false;
    return {
      update: (m) => {
        if (!done) s.message(m);
      },
      stop: (m) => {
        if (done) return;
        done = true;
        s.stop(m ?? label);
      },
      fail: (m) => {
        if (done) return;
        done = true;
        s.error(pc.red(m));
      },
    };
  }

  // ---------------------------------------------------------------- prompts

  /**
   * Yes/no. `fallback` is returned verbatim when there is no interactive
   * terminal, so callers never block on a pipe.
   */
  async confirm(question: string, fallback: boolean): Promise<boolean> {
    if (!this.fancy || !process.stdin.isTTY) return fallback;
    const a = await clack.confirm({ message: question, initialValue: false });
    if (clack.isCancel(a)) return false;
    return Boolean(a);
  }

  /** Multi-select. Returns `fallback` when non-interactive or cancelled. */
  async multiselect(
    question: string,
    options: { value: string; label: string; hint?: string }[],
    fallback: string[],
  ): Promise<string[]> {
    if (!this.fancy || !process.stdin.isTTY || !options.length) return fallback;
    const a = await clack.multiselect<string>({
      message: question,
      options,
      initialValues: fallback,
      required: false,
    });
    if (clack.isCancel(a)) return fallback;
    return a as string[];
  }

  /** Free text. Returns "" when non-interactive. */
  async text(question: string, placeholder?: string): Promise<string> {
    if (!this.fancy || !process.stdin.isTTY) return "";
    const a = await clack.text({ message: question, placeholder, defaultValue: "" });
    if (clack.isCancel(a)) return "";
    return String(a ?? "");
  }
}

// ------------------------------------------------------------------- colours

export const c = {
  ok: (s: string) => pc.green(s),
  warn: (s: string) => pc.yellow(s),
  bad: (s: string) => pc.red(s),
  dim: (s: string) => pc.dim(s),
  bold: (s: string) => pc.bold(s),
  cyan: (s: string) => pc.cyan(s),
};

/** Disable colour when the sink is not a terminal, so pipes stay clean. */
export function colorize(enabled: boolean): typeof c {
  if (enabled) return c;
  const id = (s: string) => s;
  return { ok: id, warn: id, bad: id, dim: id, bold: id, cyan: id };
}

/** Pad to `n` display columns (ASCII labels only — no wcwidth games needed). */
export function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
