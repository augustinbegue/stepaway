/**
 * Acceptance test: the real built CLI against the mock backend, no cluster.
 *
 *   bun run cli/test/e2e-mock.ts
 *
 * Runs auth → push → status → peek → pull → destroy against test/mock-server.ts
 * with a fake HOME, asserting on both the CLI's output and what the mock
 * actually received (session create, gzip'd capture bytes, run call, baton).
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { startMock, type Mock } from "./mock-server.ts";

const CLI = path.resolve(import.meta.dir, "..", "dist", "stepaway.js");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "stepaway-e2e-"));
const HOME = path.join(ROOT, "home");
const PROJ = path.join(ROOT, "proj");
const SESSION = "11111111-2222-3333-4444-555555555555";

let failures = 0;
const results: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
}

function sh(cmd: string, cwd = PROJ) {
  const r = Bun.spawnSync(["bash", "-lc", cmd], { cwd, env: { ...process.env, HOME } });
  if (r.exitCode !== 0) throw new Error(`${cmd}\n${r.stderr.toString()}`);
  return r.stdout.toString();
}

/**
 * Async on purpose: the mock backend runs in *this* process, so a blocking
 * spawnSync would deadlock the server it is talking to.
 */
async function cli(args: string[], opts: { cwd?: string } = {}) {
  const p = Bun.spawn(["node", CLI, ...args], {
    cwd: opts.cwd ?? PROJ,
    env: { ...process.env, HOME, XDG_CONFIG_HOME: path.join(HOME, ".config"), NO_COLOR: "1" },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  const code = await p.exited;
  return { code, out, err };
}

function fixture() {
  fs.mkdirSync(PROJ, { recursive: true });
  fs.mkdirSync(HOME, { recursive: true });
  sh("git init -q -b main . && git config user.email t@t && git config user.name t");
  fs.writeFileSync(path.join(PROJ, "README.md"), "# fixture\n");
  fs.writeFileSync(path.join(PROJ, ".gitignore"), "secret.txt\n");
  sh("git add -A && git commit -qm init");
  fs.writeFileSync(path.join(PROJ, "dirty.txt"), "uncommitted work\n");
  // a declared-but-unset variable, so the D4 preflight really queries /env-names
  fs.writeFileSync(path.join(PROJ, ".env.example"), "FIXTURE_TOKEN=\n");
  // a claude transcript so push has a session to carry
  const slug = PROJ.replace(/[/.]/g, "-");
  const dir = path.join(HOME, ".claude", "projects", slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${SESSION}.jsonl`),
    [
      JSON.stringify({ type: "user", cwd: PROJ, message: { content: "do the thing" } }),
      JSON.stringify({ type: "assistant", cwd: PROJ, message: { content: [{ type: "text", text: "on it" }] } }),
    ].join("\n") + "\n",
  );
}

const gzip = (b: Uint8Array) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;

async function main() {
  fixture();
  const mock: Mock = await startMock();
  const S = ["--server", mock.url, "--server-token", "t"];
  const transcriptOf = (id: string) => mock.calls.filter((c) => c.path.includes(id));

  // ---------------------------------------------------------------- auth
  const auth = await cli(["auth", ...S, "--token", "sk-ant-oat01-abcdefghijklmnopqrstuvwxyz0123456789"]);
  check("auth exits 0", auth.code === 0, auth.err.trim().split("\n").slice(-1)[0]);
  const cfgPath = path.join(HOME, ".config", "stepaway", "config.json");
  const saved = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, "utf8")) : {};
  check("global config written", saved.server === mock.url && saved.token === "t", cfgPath);
  const mode = fs.existsSync(cfgPath) ? (fs.statSync(cfgPath).mode & 0o777).toString(8) : "-";
  check("config is 600", mode === "600", `mode ${mode}`);
  check("mock received the claude token", mock.claudeToken?.startsWith("sk-ant-oat01") === true);
  check("token never printed", !auth.out.includes("sk-ant-oat01-abcdef"));

  // ---------------------------------------------------------------- push
  // no flags: proves the saved global config is what the CLI now uses
  const push = await cli(["push", "--yes", "--goal", "finish the refactor", "--session", SESSION]);
  check("push exits 0", push.code === 0, push.err.trim().split("\n").slice(-2).join(" | "));
  const create = mock.calls.find((c) => c.method === "POST" && c.path === "/v1/sessions");
  check("POST /sessions before capture", Boolean(create) && create!.body?.sessionId === SESSION, JSON.stringify(create?.body));
  const capture = mock.calls.find((c) => c.method === "POST" && c.path.endsWith("/capture"));
  check("capture upload received", Boolean(capture) && (capture!.bytes ?? 0) > 0, `${capture?.bytes} bytes`);
  check("capture body is gzip", gzip(mock.captures.get(SESSION) ?? new Uint8Array()), "magic 1f 8b");
  const run = mock.calls.find((c) => c.method === "POST" && c.path.endsWith("/run"));
  check("POST /run with the goal", run?.body?.instruction === "finish the refactor", JSON.stringify(run?.body));
  check("no appendSystemPrompt from the CLI", run?.body?.appendSystemPrompt === undefined, "server owns the default");
  const orderOk =
    mock.calls.findIndex((c) => c.method === "POST" && c.path === "/v1/sessions") <
    mock.calls.findIndex((c) => c.path.endsWith("/capture"));
  check("session created before anything was uploaded", orderOk);
  const envq = mock.calls.find((c) => c.path.endsWith("/env-names"));
  check(
    "env preflight via GET /env-names (names only)",
    Boolean(envq) && (envq!.query.names ?? "").includes("FIXTURE_TOKEN"),
    JSON.stringify(envq?.query),
  );
  const batonPath = path.join(PROJ, ".git", "stepaway-baton.json");
  const baton = fs.existsSync(batonPath) ? JSON.parse(fs.readFileSync(batonPath, "utf8")) : {};
  check(
    "baton records {server, sessionId}",
    baton.server === mock.url && baton.id === SESSION && !("target" in baton),
    JSON.stringify(baton),
  );
  check("consent summary printed even with --yes", push.out.includes("does NOT move") || push.err.includes("does NOT move"));

  // ---------------------------------------------------------------- status
  const st = await cli(["status"]);
  check("status exits 0", st.code === 0, st.err.trim());
  check("status renders the state field", /state:\s+running/.test(st.out), st.out.split("\n").find((l) => l.startsWith("state")) ?? "");
  check("status names the backend", st.out.includes(mock.url));

  // ---------------------------------------------------------------- peek
  const peek = await cli(["peek"]);
  check("peek exits 0", peek.code === 0, peek.err.trim());
  check("peek renders assistant prose", peek.out.includes("Picking up where you left off"));
  check("peek renders tool calls", /Bash/.test(peek.out) && peek.out.includes("bun test"));
  const peekF = await cli(["peek", "-f"]);
  check("peek -f (SSE) renders the same lines", peekF.out.includes("Tests pass"), peekF.err.trim().slice(0, 120));

  // ---------------------------------------------------------------- pull
  // the mock serves the pushed tar back as the archive: a true round trip
  const pull = await cli(["pull", "--overwrite"]);
  check("pull exits 0", pull.code === 0, pull.err.trim().split("\n").slice(-2).join(" | "));
  const arch = mock.calls.find((c) => c.path.endsWith("/archive"));
  check("GET /archive streamed", Boolean(arch) && (arch!.bytes ?? 0) > 0, `${arch?.bytes} bytes`);
  check("restored the working tree", fs.readFileSync(path.join(PROJ, "dirty.txt"), "utf8").includes("uncommitted"));
  const del = mock.calls.find((c) => c.method === "DELETE" && c.path === `/v1/sessions/${SESSION}`);
  check("DELETE /sessions/:id after a successful pull", Boolean(del));
  check("baton cleared", !fs.existsSync(batonPath));
  check("session gone from the backend", !mock.sessions.has(SESSION));
  check("transcript came home", fs.existsSync(path.join(HOME, ".claude", "projects", PROJ.replace(/[/.]/g, "-"), `${SESSION}.jsonl`)));

  // ------------------------------------------------- decline path (no TTY)
  const declined = await cli(["push", "--session", SESSION]);
  check("push without consent exits 1", declined.code === 1, (declined.err || declined.out).trim().split("\n").slice(-1)[0]);
  check("declined push deleted the empty session", !mock.sessions.has(SESSION));
  check(
    "declined push uploaded nothing",
    mock.calls.filter((c) => c.path.endsWith("/capture")).length === 1,
    "still just the one capture from the accepted push",
  );

  // ------------------------------------------------- list + destroy + errors
  const other = "99999999-8888-7777-6666-555555555555";
  await fetch(`${mock.url}/v1/sessions`, {
    method: "POST",
    headers: { authorization: "Bearer t", "content-type": "application/json" },
    body: JSON.stringify({ sessionId: other, project: "proj" }),
  });
  const bad = await cli(["status"], { cwd: ROOT });
  check("status with no baton lists sessions", bad.code === 0 && /SESSION\s+PROJECT\s+STATE/.test(bad.out), bad.out.split("\n").slice(-2)[0]);
  const destroy = await cli(["destroy", "--session", other, "--yes"]);
  check("destroy exits 0", destroy.code === 0, destroy.err.trim());
  check("destroy deleted the session", !mock.sessions.has(other));
  const doctor = await cli(["doctor"]);
  check("doctor merges server diagnostics", doctor.out.includes("server: rbac") && doctor.out.includes("server: claude-token"));
  check("doctor has no kubectl check", !/kubectl/i.test(doctor.out + doctor.err));
  const wrongToken = await cli(["status", "--server", mock.url, "--server-token", "nope"], { cwd: ROOT });
  check("401 surfaces the JSON error", /unauthorized/.test(wrongToken.out + wrongToken.err), (wrongToken.err || wrongToken.out).trim().split("\n")[0]);

  // major skew must hard-fail
  const skewed = await startMock({ version: "9.0.0" });
  const skew = await cli(["push", "--yes", "--server", skewed.url, "--server-token", "t"]);
  check("major version skew refuses", skew.code === 1 && /incompatible versions/.test(skew.err + skew.out), (skew.err || skew.out).trim().split("\n").slice(-1)[0]);
  skewed.stop();

  mock.stop();
  process.stdout.write(results.join("\n") + `\n\n${results.length - failures}/${results.length} passed\n`);
  fs.rmSync(ROOT, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}

await main();
