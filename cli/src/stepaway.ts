#!/usr/bin/env node
import * as os from "node:os";
import * as path from "node:path";
import { cmdPush } from "./commands/push.js";
import { cmdPull } from "./commands/pull.js";
import { cmdStatus } from "./commands/status.js";
import { cmdDoctor } from "./commands/doctor.js";
import { cmdInit } from "./commands/init.js";
import { cmdSkill } from "./commands/skill.js";
import { cmdAuth } from "./commands/auth.js";
import { cmdPeek } from "./commands/peek.js";
import { cmdDestroy } from "./commands/destroy.js";
import { buildManifest, captureLocal, rewriteSessions, selectSession } from "./capture.js";
import { excludePrefixes } from "@stepaway/core";
import { loadConfig } from "./config.js";
import { VERSION } from "./version.js";

const HELP = `stepaway ${VERSION} — move a live Claude Code session to a runner on your cluster, and back.

usage:
  stepaway auth              point this laptop at a backend and store your Claude token there
  stepaway push [dir]        hand this session off: capture, restore on a fresh pod, run unattended
  stepaway peek [dir]        watch what the agent is doing (-f to follow)
  stepaway pull [dir]        bring code + transcript home, then delete the pod and its PVC
  stepaway status [dir]      where is this project right now?
  stepaway destroy [dir]     abandon a handoff: delete the pod and its PVC
  stepaway doctor [dir]      check everything push needs, here and on the backend
  stepaway init [dir]        write .stepaway.json
  stepaway skill install     install the Claude Code skill into ~/.claude/skills

flags:
  --server <url>             stepaway backend base URL (https://…)
  --server-token <value>     bearer token for that backend (see the chart's NOTES.txt)
  --session <id>             which session to act on (push: which transcript to carry)
  --remote-base <path>       remote working-tree parent (default /work)
  --goal "<text>"            push only: what the agent should continue with
  --token <value>            auth only: skip 'claude setup-token' and store this
  --yes, -y                  skip the prompt (the summary is still printed)
  --overwrite                pull only: let the runner's state replace local changes
  -f, --follow               peek only: stream as it happens
  --json                     machine-readable output where it makes sense
  --verbose                  show the per-phase detail behind each step
  -h, --help, -v, --version

The CLI is a pure HTTP client of the stepaway backend (install it with the Helm
chart). No kubectl, no kubeconfig, nothing cluster-shaped on this machine.

One pod per session: the git dir lives on a per-session PVC at /repo, the working
tree on an emptyDir at /work. Commits survive a pod crash; the working tree does not.

config: ~/.config/stepaway/config.json holds {server, token} for this machine;
.stepaway.json in the project root holds project choices (and may override the
server). Flags beat both.
`;

type Parsed = { cmd: string; args: string[]; flags: Record<string, any> };

const VALUE_FLAGS = new Set([
  "server",
  "server-token",
  "remote-base",
  "goal",
  "session",
  "token",
]);
const BOOL_FLAGS = new Set(["yes", "json", "overwrite", "help", "version", "follow", "verbose"]);

export function parseArgs(argv: string[]): Parsed {
  const flags: Record<string, any> = {};
  const args: string[] = [];
  let cmd = "";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h") {
      flags.help = true;
    } else if (a === "-v") {
      flags.version = true;
    } else if (a === "-y") {
      flags.yes = true;
    } else if (a === "-f") {
      flags.follow = true;
    } else if (a.startsWith("--")) {
      let name = a.slice(2);
      let value: string | undefined;
      const eq = name.indexOf("=");
      if (eq !== -1) {
        value = name.slice(eq + 1);
        name = name.slice(0, eq);
      }
      if (VALUE_FLAGS.has(name)) {
        if (value === undefined) value = argv[++i];
        if (value === undefined) throw new Error(`--${name} needs a value`);
        flags[name] = value;
      } else if (BOOL_FLAGS.has(name)) {
        flags[name] = value === undefined ? true : value !== "false";
      } else {
        throw new Error(`unknown flag: --${name}`);
      }
    } else if (!cmd) {
      cmd = a;
    } else {
      args.push(a);
    }
  }
  return { cmd, args, flags };
}

async function main(): Promise<number> {
  let p: Parsed;
  try {
    p = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n\n${HELP}`);
    return 2;
  }
  if (p.flags.version || p.cmd === "version") {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (!p.cmd || p.flags.help || p.cmd === "help") {
    process.stdout.write(HELP);
    return 0;
  }

  switch (p.cmd) {
    case "auth":
      return cmdAuth(p.args, p.flags);
    case "push":
      return cmdPush(p.args, p.flags);
    case "peek":
      return cmdPeek(p.args, p.flags);
    case "pull":
      return cmdPull(p.args, p.flags);
    case "status":
      return cmdStatus(p.args, p.flags);
    case "destroy":
      return cmdDestroy(p.args, p.flags);
    case "doctor":
      return cmdDoctor(p.args, p.flags);
    case "init":
      return cmdInit(p.args, p.flags);
    case "skill":
      return cmdSkill(p.args, p.flags);
    case "_capture": {
      // hidden debug command: run the local capture path only.
      // usage: stepaway _capture <project_dir> <out_dir> [rewrite_target_path]
      const [dir, out, target] = p.args;
      if (!dir || !out) {
        process.stderr.write("usage: stepaway _capture <project_dir> <out_dir> [rewrite_target_path]\n");
        return 2;
      }
      const root = path.resolve(dir);
      const cfg = loadConfig(root);
      const sid = p.flags.session ? String(p.flags.session) : selectSession(os.homedir(), root, null);
      await captureLocal(root, path.resolve(out), {
        sessionId: sid,
        excludes: excludePrefixes(cfg),
        composeFile: cfg.composeFile,
      });
      const m = buildManifest(path.resolve(out));
      if (target) rewriteSessions(path.resolve(out), m.captured.project_path, target);
      process.stdout.write(JSON.stringify(m, null, 2) + "\n");
      return 0;
    }
    default:
      process.stderr.write(`unknown command: ${p.cmd}\n\n${HELP}`);
      return 2;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e: Error) => {
    // one red line by default; the stack is detail, not news
    const verbose = process.argv.includes("--verbose");
    const red = (s: string) => (process.stderr.isTTY ? `\u001b[31m${s}\u001b[39m` : s);
    process.stderr.write(red(`stepaway: ${e.message}`) + "\n");
    if (verbose && e.stack) process.stderr.write(`${e.stack}\n`);
    else process.stderr.write("re-run with --verbose for the full stack\n");
    process.exitCode = 1;
  });
