import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { bashAsync, isTTY, shq } from "../sh.js";
import { Ui, colorize, pad } from "../ui.js";
import {
  capturedSessionId,
  excludePrefixes,
  remoteGitDir,
  remoteProjectPath,
  unsatisfiedVars,
  type CaptureReport,
  type Manifest,
} from "@stepaway/core";
import { openClient, projectRoot, rememberEnvChoice, resolveConfig, writeBaton } from "../config.js";
import type { Client } from "../client.js";
import { buildManifest, captureLocal, readLines, rewriteSessions, selectSession } from "../capture.js";
import { carryEnvFiles, resolveEnvPlan } from "../envcarry.js";
import { captureDocker, human, planDocker, type DockerPlan } from "../docker.js";
import { resolveSetup } from "../setup.js";

const DEFAULT_INSTRUCTION =
  "You were handed off mid-task to a runner. Review the last few turns and the working tree, then continue the task in progress.";

/** Only mention a specific dirty file inline when its size is a surprise. */
const BIG_FILE_BYTES = 50 * 1024 * 1024;

const LABEL_W = 18;

/**
 * The consent contract.
 *
 * Every fact in here is load-bearing — this is what the user is agreeing to, so
 * nothing is ever dropped, only laid out better: aligned labels, green for what
 * moves, yellow for what does not, red for the warnings. Colour is decoration
 * on top of a block that reads identically in a pipe.
 */
export function consentSummary(
  m: Manifest,
  opts: {
    remote: string;
    gitDir: string;
    target: string;
    docker: DockerPlan | null;
    setup: string | null;
    instruction: string;
    color?: boolean;
    verbose?: boolean;
  },
): string {
  const k = colorize(opts.color !== false);
  const c = m.captured;
  const n = m.not_captured;
  const L: string[] = [];
  const row = (label: string, value: string, tint: (s: string) => string = (s) => s) =>
    L.push(`  ${k.dim(pad(label, LABEL_W))}${tint(value)}`);
  const cont = (value: string, tint: (s: string) => string = (s) => s) =>
    L.push(`  ${" ".repeat(LABEL_W)}${tint(value)}`);

  L.push(`${k.bold(c.project_path)}  ${k.dim("→")}  ${k.bold(`${opts.target}:${opts.remote}`)}`);
  L.push("");

  L.push(k.ok(k.bold("moves")));
  row("branch", `${c.branch} @ ${c.head.slice(0, 12)}`, k.ok);
  row("dirty/untracked", `${c.dirty_file_count} file(s)`, k.ok);
  // only the single biggest file, and only when big enough to matter
  const big = c.largest_dirty_files.filter((f) => f.bytes > BIG_FILE_BYTES);
  if (big.length && !opts.verbose) {
    cont(`${big[0].path} (${human(big[0].bytes)})`, k.warn);
    if (big.length > 1) cont(`+${big.length - 1} more over 50 MB — see --verbose`, k.dim);
  } else if (opts.verbose) {
    for (const f of c.largest_dirty_files) cont(`${f.path} (${human(f.bytes)})`, k.dim);
  }
  row("session", c.session_ids.length ? c.session_ids.join(", ") : "(none — code only)", k.ok);
  row("project config", ".claude/, CLAUDE.md (if present)", k.ok);
  row(
    "env files",
    c.env_files.length
      ? c.env_files.map((e) => `${e.path} (${e.vars} var${e.vars === 1 ? "" : "s"})`).join(", ")
      : "(none)",
    k.ok,
  );
  if (opts.docker) {
    const d = opts.docker;
    row(
      "services",
      `stops ${d.containers.length} container(s): ` +
        (d.containers.length ? d.containers.map((x) => x.name).join(", ") : "(none running)"),
      k.ok,
    );
    cont(`carries volume(s): ` + (d.volumes.length ? d.volumes.join(", ") : "(none)"), k.ok);
    cont(`laptop containers are restarted right after capture`, k.dim);
  }
  row("setup", opts.setup ?? "(none detected)", k.ok);
  row("agent", `runs autonomously on the runner: ${truncate(opts.instruction, 80)}`, k.ok);
  L.push("");

  L.push(k.warn(k.bold("does NOT move")));
  row("gitignored files", String(n.gitignored_files), k.warn);
  row(
    "env files",
    `${n.env.skipped_env_files.length} skipped` +
      (n.env.skipped_env_files.length ? `: ${n.env.skipped_env_files.join(", ")}` : ""),
    k.warn,
  );
  row(
    "env vars unmet",
    n.env.unsatisfied_variables.length
      ? n.env.unsatisfied_variables.join(", ")
      : "none — all declared vars resolve",
    n.env.unsatisfied_variables.length ? k.bad : k.warn,
  );
  if (n.orphan_containers.length) {
    row("orphan containers", `${n.orphan_containers.join(", ")} (no compose definition; cannot be rebuilt)`, k.bad);
  }
  row("docker volumes", "never come back on pull; they die with the pod", k.bad);
  row("also staying", "running processes, local services outside the compose project", k.warn);
  L.push("");
  L.push(
    k.dim(
      `durability: commits land on the PVC at ${opts.gitDir}; the working tree at ${opts.remote} does not survive the pod.`,
    ),
  );
  return L.join("\n");
}

/**
 * Sink for the chatty per-phase logs the lower layers emit (docker chatter,
 * restore report). They are internal dialogue: behind --verbose, never on the
 * happy path.
 */
function quiet(ui: Ui): (s: string) => void {
  return (s: string) => {
    const text = s.replace(/[.\s]+$/, "").trim();
    if (text) ui.detail(text);
  };
}

function truncate(s: string, n: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length <= n ? one : one.slice(0, n - 1) + "…";
}

export async function cmdPush(args: string[], flags: Record<string, any>): Promise<number> {
  const ui = Ui.from(flags);
  const dir = args[0] ?? process.cwd();
  const root = projectRoot(dir);
  if (!fs.existsSync(path.join(root, ".git"))) {
    ui.error(`not a git repository: ${root}`, "run stepaway push from inside a git project");
    return 1;
  }
  const opened = openClient(root, flags);
  if (!opened.client) {
    ui.error("no backend configured", opened.error);
    return 1;
  }
  const client: Client = opened.client;

  ui.intro(`stepaway push  ${path.basename(root)}`);
  const cfg = resolveConfig(root, flags);
  const home = os.homedir();
  const excludes = excludePrefixes(cfg);

  // 1. the session decides the session id, so resolve it before anything else
  const wanted = flags.session ? String(flags.session) : null;
  const sid = selectSession(home, root, wanted);
  if (wanted && !sid) {
    ui.error(`no transcript ${wanted}.jsonl for ${root}`, "list sessions: ls ~/.claude/projects");
    return 1;
  }
  if (!sid) ui.warn(`no Claude transcript for ${root}; carrying code only`);
  const apiId = sid ?? randomUUID();
  const remote = remoteProjectPath(cfg, root);
  const gitDir = remoteGitDir(root);
  const target = client.server;

  // 2. preflight: the backend answers, and speaks our version
  try {
    const skew = await client.checkVersion();
    if (skew.fatal) {
      ui.error(skew.message ?? "incompatible backend version");
      return 1;
    }
    if (skew.message) ui.warn(skew.message);
  } catch (e) {
    ui.error(`backend unreachable: ${(e as Error).message}`, "check the URL and token, then: stepaway doctor");
    return 1;
  }

  // 3. create the session NOW so the pod boots while we capture. It is empty
  //    and visibly `pending`: nothing has left the laptop yet.
  const boot = ui.spinner(`creating session ${apiId.slice(0, 8)} on ${target}`);
  let session;
  try {
    session = await client.createSession({
      sessionId: apiId,
      project: path.basename(root),
      options: { remotePathBase: cfg.remotePathBase },
    });
  } catch (e) {
    boot.fail(`could not create the session: ${(e as Error).message}`);
    return 1;
  }

  // From here on, any abort must take the (empty) pod down with it.
  let disarmed = false;
  const abandon = async (why: string) => {
    if (disarmed) return;
    disarmed = true;
    try {
      await client.deleteSession(apiId);
      ui.detail(`${why}: deleted session ${apiId}`);
    } catch (e) {
      ui.warn(`could not delete session ${apiId}: ${(e as Error).message} — run: stepaway destroy --session ${apiId}`);
    }
  };
  const onSigint = () => {
    void abandon("interrupted").then(() => {
      process.stderr.write("\naborted — nothing was moved; the runner was deleted\n");
      process.exit(130);
    });
  };
  process.on("SIGINT", onSigint);
  const done = (code: number) => {
    process.off("SIGINT", onSigint);
    return code;
  };

  // 4. capture
  const stamp = Date.now();
  const capDirName = `stepaway-${stamp}`;
  const capDir = path.join(os.tmpdir(), capDirName);
  boot.update(`runner ${session.podName || apiId.slice(0, 8)} booting — capturing ${path.basename(root)} meanwhile`);
  try {
    await captureLocal(root, capDir, { sessionId: sid, excludes, composeFile: cfg.composeFile });
  } catch (e) {
    boot.fail(`capture failed: ${(e as Error).message}`);
    await abandon("capture failed");
    return done(1);
  }

  const cleanup = () => fs.rmSync(capDir, { recursive: true, force: true });

  // 5. env files: remembered config, else picker, else carry everything declared.
  //    duplicate spellings of one path (./x/.env vs x/.env) collapse to one.
  const rawDeclared = readLines(capDir, "meta/declared-env-files.txt");
  // the picker owns the terminal while it is up: a live spinner would fight it
  boot.stop(`captured ${path.basename(root)}; runner still booting`);
  const {
    plan: envPlan,
    asked,
    declared,
  } = await resolveEnvPlan(rawDeclared, cfg.env, { interactive: !flags.yes, ui, root });
  const envResult = carryEnvFiles(root, capDir, declared, envPlan);
  if (asked) {
    const p = rememberEnvChoice(root, { carryFiles: envPlan.carryFiles, excludeVars: envPlan.excludeVars });
    ui.detail(`remembered env choices in ${p}`);
  }

  // 6. hard-fail preflight on required var names (D4: never default to blank).
  //    Needs the runner's own environment, so wait for pending → ready first.
  const required = readLines(capDir, "meta/required-vars.txt");
  const wait = ui.spinner("waiting for the runner (image pull + claude install)");
  try {
    const ready = await client.waitReady(apiId, {
      onState: (s) => wait.update(`runner ${s.podName || apiId.slice(0, 8)}: ${s.state}`),
    });
    wait.stop(`runner ${ready.podName || apiId.slice(0, 8)} ready`);
  } catch (e) {
    wait.fail((e as Error).message);
    cleanup();
    await abandon("runner never became ready");
    return done(1);
  }
  let runnerEnv: Set<string>;
  try {
    runnerEnv = await client.envNames(apiId, required);
  } catch (e) {
    ui.warn(`could not query the runner's env names (${(e as Error).message}); assuming none are set`);
    runnerEnv = new Set();
  }
  const unmet = unsatisfiedVars(required, envResult.satisfied, runnerEnv);
  if (unmet.length) {
    cleanup();
    await abandon("unsatisfied variables");
    ui.error(
      `refusing to hand off: ${unmet.length} declared variable(s) would be missing on the runner: ${unmet.join(", ")}`,
      `carry the file that defines them, or set them in .stepaway.json:\n` +
        `  { "env": { "carryFiles": [...], "overrideVars": { "${unmet[0]}": "value" } } }\n` +
        `nothing was transferred; the empty runner was deleted.`,
    );
    return done(1);
  }

  // 7. what docker WOULD do (read-only — nothing is stopped before consent)
  const dplan = planDocker(root, cfg.composeFile);
  const setupCmd = resolveSetup(root, cfg.setup);
  const instruction = flags.goal ? String(flags.goal) : DEFAULT_INSTRUCTION;

  let m = buildManifest(capDir, {
    envFiles: envResult.carried,
    unsatisfied: unmet,
    skippedEnvFiles: envResult.skipped,
    docker: dplan
      ? {
          compose_file: dplan.composeFile,
          project: dplan.project,
          containers: dplan.containers.map((c) => ({ name: c.name, image: c.image, digest: c.digest })),
          volumes: dplan.volumes.map((v) => ({ name: v, bytes: 0 })),
          refused: [],
          orphans: dplan.orphans,
        }
      : null,
  });

  // rewrite transcripts for the target path + trim phantom resume turns
  const rw = rewriteSessions(capDir, m.captured.project_path, remote);
  if (rw.trimmed) ui.detail(`trimmed ${rw.trimmed} phantom transcript line(s)`);

  // 8. consent — printed even with --yes, because the skill relays it
  const summary = consentSummary(m, {
    remote,
    gitDir,
    target,
    docker: dplan,
    setup: setupCmd,
    instruction,
    color: ui.fancy,
    verbose: ui.verbose,
  });
  ui.note(summary, "this is what moves");
  if (!flags.yes) {
    if (!isTTY()) {
      ui.error("refusing to transfer without consent (no TTY)", "re-run with --yes");
      cleanup();
      await abandon("no consent");
      return done(1);
    }
    if (!(await ui.confirm("Hand this session off to the runner?", false))) {
      cleanup();
      await abandon("declined");
      ui.cancel("aborted — nothing was moved, nothing was stopped, and the empty runner was deleted");
      return done(1);
    }
  }

  // 9. quiesce + carry docker state (consent has been given by here)
  if (dplan) {
    const spin = ui.spinner(`quiescing ${dplan.containers.length} container(s)`);
    const dres = await captureDocker(root, capDir, dplan, quiet(ui));
    spin.stop(`services quiesced and volumes carried`);
    for (const w of dres.warnings) ui.warn(w);
    m = buildManifest(capDir, {
      envFiles: envResult.carried,
      unsatisfied: unmet,
      skippedEnvFiles: envResult.skipped,
      docker: dres.manifest,
    });
  }

  // 10. transfer: one tar, streamed straight into the runner's `tar -xz`.
  //     The backend runs restore + setup in-pod and reports back.
  const xfer = ui.spinner(`transferring to ${target}`);
  const tarPath = path.join(os.tmpdir(), `${capDirName}.tar.gz`);
  const tr = await bashAsync(`set -e; tar czf ${shq(tarPath)} -C ${shq(os.tmpdir())} ${shq(capDirName)}`);
  if (tr.code !== 0) {
    xfer.fail(`tar failed: ${lastLine(tr.stderr)}`);
    cleanup();
    await abandon("tar failed");
    return done(1);
  }
  let report: CaptureReport;
  try {
    report = await client.uploadCapture(apiId, tarPath, setupCmd);
  } catch (e) {
    xfer.fail(`upload failed: ${(e as Error).message}`);
    fs.rmSync(tarPath, { force: true });
    cleanup();
    ui.error("the session still exists on the backend", `retry, or: stepaway destroy --session ${apiId}`);
    return done(1);
  }
  fs.rmSync(tarPath, { force: true });
  cleanup();
  xfer.stop(`transferred to ${target} and restored on the runner`);
  ui.detail(JSON.stringify(report));

  if (report && report.restored === false) {
    ui.error("the runner could not restore the capture", `stepaway destroy --session ${apiId} to clean up`);
    return done(1);
  }
  if (report?.docker && report.docker.attempted && !report.docker.ok) {
    ui.warn(`services did not all come up on the runner${report.docker.detail ? `: ${report.docker.detail}` : ""}`);
  }
  if (report?.setup && report.setup.attempted && !report.setup.ok) {
    ui.warn(`setup failed on the runner (${report.setup.cmd ?? setupCmd}) — the agent can often fix it`);
    if (report.setup.tail) ui.detail(report.setup.tail);
  }

  // 11. launch — v0.2 still always runs unattended. Permission probing and the
  //     commit-locally guidance are the backend's job now.
  const launch = ui.spinner("starting the unattended run");
  try {
    await client.run(apiId, { instruction });
    launch.stop("agent running unattended on the runner");
  } catch (e) {
    launch.fail(`could not start the run: ${(e as Error).message}`);
    ui.error("the runner is up with your code on it", `retry, or: stepaway destroy --session ${apiId}`);
    return done(1);
  }

  writeBaton(root, {
    pushedAt: new Date().toISOString(),
    server: target,
    id: apiId,
    sessionId: capturedSessionId(m) ?? sid,
    remotePath: report?.workTree || remote,
  });
  disarmed = true;

  ui.outro(
    `pushed — the cloud is now the source of truth for ${path.basename(root)}\n` +
      `  watch:       stepaway peek -f\n` +
      `  bring back:  stepaway pull\n` +
      `  abandon:     stepaway destroy`,
  );

  if (flags.json) {
    process.stdout.write(
      JSON.stringify(
        { ok: true, server: target, sessionId: apiId, remotePath: report?.workTree || remote, gitDir, report, manifest: m },
        null,
        2,
      ) + "\n",
    );
  }
  return done(0);
}

/** Errors from remote phases can be pages long; the last line is the news. */
function lastLine(s: string): string {
  const lines = s.trim().split("\n").filter((l) => l.trim());
  return lines.length ? lines[lines.length - 1] : "(no output)";
}
