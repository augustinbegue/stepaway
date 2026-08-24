/** Single-quote a string for POSIX sh. */
export function shq(s: string): string {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/**
 * Run one of the @stepaway/core bash constants with positional arguments.
 * `bash -c <script> <argv0> <args...>` gives the script its $1..$n without ever
 * putting it on a command line we have to quote.
 */
export function bashScript(script: string, args: string[] = []): string[] {
  return ["bash", "-c", script, "stepaway", ...args];
}

/** Run an ad-hoc command line in a login-ish shell (PATH from the image). */
export function bashLine(line: string): string[] {
  return ["bash", "-c", line];
}

/** Last non-empty line of a command's output — what an error message wants. */
export function lastLine(s: string): string {
  const lines = s.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

/** Last n lines, for setup/restore tails in reports. */
export function tail(s: string, n = 5): string {
  return s.split("\n").filter((l) => l.trim()).slice(-n).join("\n");
}
