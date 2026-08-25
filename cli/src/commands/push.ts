import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { bashAsync, lastLine, shq } from "../sh.js";
import { Ui, colorize, pad, type Spin } from "../ui.js";
import {
  DEFAULT_INSTRUCTION,
  capturedSessionId,
  clip,
  excludePrefixes,
  remoteGitDir,
  remoteProjectPath,
  unsatisfiedVars,
  type CaptureReport,
  type DockerManifest,
  type Manifest,
  type ManifestExtras,
  type Session,
} from "@stepaway/core";
import {
  openClient,
  projectRoot,
  rememberEnvChoice,
  resolveConfig,
  writeBaton,
  type ProjectConfig,
} from "../config.js";
import type { Client } from "../client.js";
import { buildManifest, captureLocal, readLines, rewriteSessions, selectSession } from "../capture.js";
import { carryEnvFiles, resolveEnvPlan, type EnvCarryResult } from "../envcarry.js";
import { captureDocker, human, planDocker, type DockerPlan } from "../docker.js";
import { resolveSetup } from "../setup.js";

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
  row("agent", `runs autonomously on the runner: ${clip(opts.instruction, 80)}`, k.ok);
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

/**
 * Everything a phase needs, in one bag. Built once by cmdPush, mutated by the
 * phases in order — so each phase reads like the sentence it implements.
 */
type PushCtx = {
  ui: Ui;
  client: Client;
  flags: Record<string, any>;
  root: string;
  cfg: ProjectConfig;
  home: string;
  excludes: string[];
  /** the claude transcript id, if this project has one. */
  sid: string | null;
  /** the API session id: the transcript id, or a fresh uuid. */
  apiId: string;
  remote: string;
  gitDir: string;
  target: string;
  capDirName: string;
  capDir: string;
  tarPath: string;
  /** stop the push: records why, so the finalizer can name it. Always 1. */
  fail: (why: string) => number;
  /** arm the "abandon the session" finalizer (once the session exists). */
  arm: () => void;
  /** keep the session on the backend even though the push failed. */
  disarm: () => void;

  // filled in as the phases run
  boot: Spin | null;
  session: Session | null;
  env: EnvCarryResult | null;
  unmet: string[];
  dplan: DockerPlan | null;
  setupCmd: string | null;
  instruction: string;
  manifest: Manifest | null;
  report: CaptureReport | null;
};

/** A phase returns an exit code to stop the push, or null to carry on. */
type Phase = (x: PushCtx) => Promise<number | null>;

/** The docker half of the manifest, from the read-only plan. */
function planToManifest(plan: DockerPlan | null): DockerManifest | null {
  if (!plan) return null;
  return {
    compose_file: plan.composeFile,
    project: plan.project,
    containers: plan.containers.map((c) => ({ name: c.name, image: c.image, digest: c.digest })),
    volumes: plan.volumes.map((v) => ({ name: v, bytes: 0 })),
    refused: [],
    orphans: plan.orphans,
  };
}

/**
 * The non-capture facts the manifest needs. Built in two places — before
 * consent from the plan, after quiescing from what actually happened — so it
 * lives here rather than twice inline.
 */
function manifestExtras(x: PushCtx, docker: DockerManifest | null): ManifestExtras {
  return {
    envFiles: x.env?.carried ?? [],
    unsatisfied: x.unmet,
    skippedEnvFiles: x.env?.skipped ?? [],
    docker,
  };
}

// ----------------------------------------------------------------- phases

/** 1. the backend answers, and speaks our version. */
const preflightBackend: Phase = async (x) => {
  try {
    const skew = await x.client.checkVersion();
    if (skew.fatal) {
      x.ui.error(skew.message ?? "incompatible backend version");
      return 1;
    }
    if (skew.message) x.ui.warn(skew.message);
  } catch (e) {
    x.ui.error(`backend unreachable: ${(e as Error).message}`, "check the URL and token, then: stepaway doctor");
    return 1;
  }
  return null;
};

/**
 * 2. create the session NOW so the pod boots while we capture. It is empty and
 *    visibly `pending`: nothing has left the laptop yet.
 */
const createSession: Phase = async (x) => {
  const boot = x.ui.spinner(`creating session ${x.apiId.slice(0, 8)} on ${x.target}`);
  x.boot = boot;
  try {
    x.session = await x.client.createSession({
      sessionId: x.apiId,
      project: path.basename(x.root),
      options: { remotePathBase: x.cfg.remotePathBase },
    });
  } catch (e) {
    boot.fail(`could not create the session: ${(e as Error).message}`);
    // nothing exists on the backend yet: the finalizer is still unarmed
    return 1;
  }
  // from here on, any abort must take the (empty) pod down with it
  x.arm();
  return null;
};

/** 3. capture the working tree while the runner boots. */
const capture: Phase = async (x) => {
  x.boot?.update(
    `runner ${x.session?.podName || x.apiId.slice(0, 8)} booting — capturing ${path.basename(x.root)} meanwhile`,
  );
  try {
    await captureLocal(x.root, x.capDir, { sessionId: x.sid, excludes: x.excludes, composeFile: x.cfg.composeFile });
  } catch (e) {
    x.boot?.fail(`capture failed: ${(e as Error).message}`);
    return x.fail("capture failed");
  }
  return null;
};

/**
 * 4. env files: remembered config, else picker, else carry everything declared.
 *    duplicate spellings of one path (./x/.env vs x/.env) collapse to one.
 */
const carryEnv: Phase = async (x) => {
  const rawDeclared = readLines(x.capDir, "meta/declared-env-files.txt");
  // the picker owns the terminal while it is up: a live spinner would fight it
  x.boot?.stop(`captured ${path.basename(x.root)}; runner still booting`);
  x.boot = null;
  const { plan, asked, declared } = await resolveEnvPlan(rawDeclared, x.cfg.env, {
    interactive: !x.flags.yes,
    ui: x.ui,
    root: x.root,
  });
  x.env = carryEnvFiles(x.root, x.capDir, declared, plan);
  if (asked) {
    const p = rememberEnvChoice(x.root, { carryFiles: plan.carryFiles, excludeVars: plan.excludeVars });
    x.ui.detail(`remembered env choices in ${p}`);
  }
  return null;
};

/**
 * 5. hard-fail preflight on required var names (D4: never default to blank).
 *    Needs the runner's own environment, so wait for pending → ready first.
 */
const waitReadyAndCheckVars: Phase = async (x) => {
  const required = readLines(x.capDir, "meta/required-vars.txt");
  const wait = x.ui.spinner("waiting for the runner (image pull + claude install)");
  try {
    const ready = await x.client.waitReady(x.apiId, {
      onState: (s) => wait.update(`runner ${s.podName || x.apiId.slice(0, 8)}: ${s.state}`),
    });
    wait.stop(`runner ${ready.podName || x.apiId.slice(0, 8)} ready`);
  } catch (e) {
    wait.fail((e as Error).message);
    return x.fail("runner never became ready");
  }
  let runnerEnv: Set<string>;
  try {
    runnerEnv = await x.client.envNames(x.apiId, required);
  } catch (e) {
    x.ui.warn(`could not query the runner's env names (${(e as Error).message}); assuming none are set`);
    runnerEnv = new Set();
  }
  x.unmet = unsatisfiedVars(required, x.env?.satisfied ?? new Set(), runnerEnv);
  if (x.unmet.length) {
    x.ui.error(
      `refusing to hand off: ${x.unmet.length} declared variable(s) would be missing on the runner: ${x.unmet.join(", ")}`,
      `carry the file that defines them, or set them in .stepaway.json:\n` +
        `  { "env": { "carryFiles": [...], "overrideVars": { "${x.unmet[0]}": "value" } } }\n` +
        `nothing was transferred; the empty runner was deleted.`,
    );
    return x.fail("unsatisfied variables");
  }
  return null;
};

/** 6. what docker WOULD do (read-only — nothing is stopped before consent). */
const planTransfer: Phase = async (x) => {
  x.dplan = planDocker(x.root, x.cfg.composeFile);
  x.setupCmd = resolveSetup(x.root, x.cfg.setup);
  x.instruction = x.flags.goal ? String(x.flags.goal) : DEFAULT_INSTRUCTION;
  x.manifest = buildManifest(x.capDir, manifestExtras(x, planToManifest(x.dplan)));

  // rewrite transcripts for the target path + trim phantom resume turns
  const rw = rewriteSessions(x.capDir, x.manifest.captured.project_path, x.remote);
  if (rw.trimmed) x.ui.detail(`trimmed ${rw.trimmed} phantom transcript line(s)`);
  return null;
};

/** 7. consent — printed even with --yes, because the skill relays it. */
const consent: Phase = async (x) => {
  const summary = consentSummary(x.manifest!, {
    remote: x.remote,
    gitDir: x.gitDir,
    target: x.target,
    docker: x.dplan,
    setup: x.setupCmd,
    instruction: x.instruction,
    color: x.ui.fancy,
    verbose: x.ui.verbose,
  });
  x.ui.note(summary, "this is what moves");
  if (!x.flags.yes) {
    // one TTY gate: the Ui knows whether a question can be asked at all
    if (!x.ui.interactive) {
      x.ui.error("refusing to transfer without consent (no TTY)", "re-run with --yes");
      return x.fail("no consent");
    }
    if (!(await x.ui.confirm("Hand this session off to the runner?", false))) {
      x.ui.cancel("aborted — nothing was moved, nothing was stopped, and the empty runner was deleted");
      return x.fail("declined");
    }
  }
  return null;
};

/** 8. quiesce + carry docker state (consent has been given by here). */
const quiesceDocker: Phase = async (x) => {
  if (!x.dplan) return null;
  const spin = x.ui.spinner(`quiescing ${x.dplan.containers.length} container(s)`);
  const dres = await captureDocker(x.root, x.capDir, x.dplan, quiet(x.ui));
  spin.stop(`services quiesced and volumes carried`);
  for (const w of dres.warnings) x.ui.warn(w);
  x.manifest = buildManifest(x.capDir, manifestExtras(x, dres.manifest));
  return null;
};

/**
 * 9. transfer: one tar, streamed straight into the runner's `tar -xz`. The
 *    backend runs restore + setup in-pod and reports back.
 */
const transfer: Phase = async (x) => {
  const xfer = x.ui.spinner(`transferring to ${x.target}`);
  const tr = await bashAsync(`set -e; tar czf ${shq(x.tarPath)} -C ${shq(os.tmpdir())} ${shq(x.capDirName)}`);
  if (tr.code !== 0) {
    xfer.fail(`tar failed: ${lastLine(tr.stderr)}`);
    return x.fail("tar failed");
  }
  try {
    x.report = await x.client.uploadCapture(x.apiId, x.tarPath, x.setupCmd);
  } catch (e) {
    xfer.fail(`upload failed: ${(e as Error).message}`);
    // deliberately NOT abandoned: the capture may already be on the runner, so
    // the session is kept for a retry and the user is told how to clean up.
    x.disarm();
    x.ui.error("the session still exists on the backend", `retry, or: stepaway destroy --session ${x.apiId}`);
    return 1;
  }
  xfer.stop(`transferred to ${x.target} and restored on the runner`);
  x.ui.detail(JSON.stringify(x.report));

  const report = x.report;
  if (report && report.restored === false) {
    x.ui.error("the runner could not restore the capture", `stepaway destroy --session ${x.apiId} to clean up`);
    // the code is on the runner: keep the session so it can be inspected
    x.disarm();
    return 1;
  }
  if (report?.docker && report.docker.attempted && !report.docker.ok) {
    x.ui.warn(`services did not all come up on the runner${report.docker.detail ? `: ${report.docker.detail}` : ""}`);
  }
  if (report?.setup && report.setup.attempted && !report.setup.ok) {
    x.ui.warn(`setup failed on the runner (${report.setup.cmd ?? x.setupCmd}) — the agent can often fix it`);
    if (report.setup.tail) x.ui.detail(report.setup.tail);
  }
  return null;
};

/**
 * 10. launch — v0.2 still always runs unattended. Permission probing and the
 *     commit-locally guidance are the backend's job now.
 */
const launch: Phase = async (x) => {
  const spin = x.ui.spinner("starting the unattended run");
  try {
    await x.client.run(x.apiId, { instruction: x.instruction });
    spin.stop("agent running unattended on the runner");
  } catch (e) {
    spin.fail(`could not start the run: ${(e as Error).message}`);
    x.ui.error("the runner is up with your code on it", `retry, or: stepaway destroy --session ${x.apiId}`);
    // the runner holds the work: never delete it from under the user
    x.disarm();
    return 1;
  }

  writeBaton(x.root, {
    pushedAt: new Date().toISOString(),
    server: x.target,
    id: x.apiId,
    sessionId: capturedSessionId(x.manifest!) ?? x.sid,
    remotePath: x.report?.workTree || x.remote,
  });
  x.disarm();

  x.ui.outro(
    `pushed — the cloud is now the source of truth for ${path.basename(x.root)}\n` +
      `  watch:       stepaway peek -f\n` +
      `  bring back:  stepaway pull\n` +
      `  abandon:     stepaway destroy`,
  );

  if (x.flags.json) {
    x.ui.raw(
      JSON.stringify(
        {
          ok: true,
          server: x.target,
          sessionId: x.apiId,
          remotePath: x.report?.workTree || x.remote,
          gitDir: x.gitDir,
          report: x.report,
          manifest: x.manifest,
        },
        null,
        2,
      ) + "\n",
    );
  }
  return 0;
};

/** The push, as the list of phases it is. */
const PHASES: Phase[] = [
  preflightBackend,
  createSession,
  capture,
  carryEnv,
  waitReadyAndCheckVars,
  planTransfer,
  consent,
  quiesceDocker,
  transfer,
  launch,
];

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

  // the session decides the session id, so resolve it before anything else
  const wanted = flags.session ? String(flags.session) : null;
  const sid = selectSession(home, root, wanted);
  if (wanted && !sid) {
    ui.error(`no transcript ${wanted}.jsonl for ${root}`, "list sessions: ls ~/.claude/projects");
    return 1;
  }
  if (!sid) ui.warn(`no Claude transcript for ${root}; carrying code only`);

  const capDirName = `stepaway-${Date.now()}`;
  const apiId = sid ?? randomUUID();

  // From the moment the session exists, any abort must take the (empty) pod
  // down with it — unless a phase explicitly disarms this finalizer.
  let armed = false;
  let disarmed = false;
  let why = "aborted";
  const abandon = async () => {
    if (!armed || disarmed) return;
    disarmed = true;
    try {
      await client.deleteSession(apiId);
      ui.detail(`${why}: deleted session ${apiId}`);
    } catch (e) {
      ui.warn(`could not delete session ${apiId}: ${(e as Error).message} — run: stepaway destroy --session ${apiId}`);
    }
  };

  const x: PushCtx = {
    ui,
    client,
    flags,
    root,
    cfg,
    home,
    excludes: excludePrefixes(cfg),
    sid,
    apiId,
    remote: remoteProjectPath(cfg, root),
    gitDir: remoteGitDir(root),
    target: client.server,
    capDirName,
    capDir: path.join(os.tmpdir(), capDirName),
    tarPath: path.join(os.tmpdir(), `${capDirName}.tar.gz`),
    fail: (reason) => {
      why = reason;
      return 1;
    },
    arm: () => {
      armed = true;
    },
    disarm: () => {
      disarmed = true;
    },
    boot: null,
    session: null,
    env: null,
    unmet: [],
    dplan: null,
    setupCmd: null,
    instruction: DEFAULT_INSTRUCTION,
    manifest: null,
    report: null,
  };

  const onSigint = () => {
    why = "interrupted";
    void abandon().then(() => {
      process.stderr.write("\naborted — nothing was moved; the runner was deleted\n");
      process.exit(130);
    });
  };
  process.on("SIGINT", onSigint);

  try {
    for (const phase of PHASES) {
      const code = await phase(x);
      if (code !== null) return code;
    }
    return 0;
  } finally {
    // One owner for every temporary and for the session itself: the capture dir
    // and its tar never outlive the command, and the runner is torn down on
    // every path that did not disarm the finalizer.
    process.off("SIGINT", onSigint);
    await abandon();
    fs.rmSync(x.tarPath, { force: true });
    fs.rmSync(x.capDir, { recursive: true, force: true });
  }
}
