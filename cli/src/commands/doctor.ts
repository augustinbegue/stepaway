import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { run, which } from "../sh.js";
import { excludePrefixes, remoteProjectPath, slugFor } from "@stepaway/core";
import { projectRoot, readBaton, resolveConfig, loadConfig } from "../config.js";
import { Client, versionSkew } from "../client.js";
import { clientConfigPath, readClientConfig, resolveClient } from "../clientconfig.js";
import { existingSlugDir, selectSession } from "../capture.js";
import { dockerAvailable, findComposeFile } from "../docker.js";
import { resolveSetup } from "../setup.js";
import { Ui, colorize, pad } from "../ui.js";
import { VERSION } from "../version.js";

type Check = { name: string; ok: boolean; detail: string; blocking: boolean };

/**
 * Local checks (git, tar, node, config, reachability, version skew) merged with
 * the backend's own `GET /v1/diagnostics` into one ✓/✗ report. No kubectl
 * anywhere: if the backend cannot see the cluster, the backend says so.
 */
export async function cmdDoctor(args: string[], flags: Record<string, any>): Promise<number> {
  const ui = Ui.from(flags);
  const root = projectRoot(args[0] ?? process.cwd());
  const cfg = resolveConfig(root, flags);
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string, blocking = true) =>
    checks.push({ name, ok, detail, blocking });

  const haveGit = which("git");
  add("git", haveGit, haveGit ? run("git", ["--version"]).stdout.trim() : "not found on PATH");
  add("tar", which("tar"), which("tar") ? "present" : "not found on PATH");
  add("bash", which("bash"), which("bash") ? "present" : "not found on PATH");
  const major = Number(process.versions.node.split(".")[0]) || 0;
  add("node >= 20", major >= 20, `${process.version} (stepaway ${VERSION})`);

  const isRepo = fs.existsSync(path.join(root, ".git"));
  add("git repo", isRepo, isRepo ? root : `${root} is not a git repository`);

  const home = os.homedir();
  const slugDir = existingSlugDir(home, root);
  const sid = selectSession(home, root, flags.session ? String(flags.session) : null);
  add(
    "claude session",
    Boolean(sid),
    sid
      ? `${sid} (from ${path.join(home, ".claude", "projects", slugDir ?? slugFor(root))})`
      : `no transcript at ~/.claude/projects/${slugFor(root)} (nothing to resume; code still moves)`,
    false,
  );

  const compose = findComposeFile(root, cfg.composeFile);
  const haveDocker = compose ? dockerAvailable() : false;
  add(
    "docker carry",
    true,
    compose
      ? haveDocker
        ? `${compose} + local daemon reachable — services will be quiesced and carried`
        : `${compose} found but no reachable docker daemon; services will be skipped`
      : "no compose file; code + session handoff only",
    false,
  );

  const setup = resolveSetup(root, cfg.setup);
  add("setup command", true, setup ?? "none detected (no lockfile); nothing will run", false);
  add("excludes", true, excludePrefixes(cfg).join(", ") || "(none)", false);

  // ---- the backend half
  const global = readClientConfig();
  const r = resolveClient(flags, loadConfig(root).server, global);
  const cfgFile = clientConfigPath();
  add(
    "client config",
    Boolean(global.server && global.token) || Boolean(r.server && r.token),
    r.server && r.token
      ? `server from ${r.sources.server}, token from ${r.sources.token} (${cfgFile})`
      : `missing ${cfgFile} — run: stepaway auth --server <url> --server-token <token>`,
  );

  if (r.server && r.token) {
    const client = new Client({ server: r.server, token: r.token });
    let reachable = false;
    try {
      const v = await client.version();
      reachable = true;
      add(`backend ${r.server}`, true, `reachable, api ${v?.api ?? "?"} v${v?.version ?? "?"}`);
      // exactly the client's rule (warn on minor, refuse on major) — one
      // definition of skew for every command.
      const skew = versionSkew(VERSION, v?.version ?? "0.0.0");
      add(
        "version skew",
        !skew.fatal,
        skew.message ?? `CLI and backend both ${VERSION}`,
        skew.fatal,
      );
    } catch (e) {
      add(`backend ${r.server}`, false, (e as Error).message);
    }
    if (reachable) {
      try {
        const d = await client.diagnostics();
        for (const c of d.checks ?? []) {
          add(`server: ${c.name}`, c.ok, c.detail ?? (c.ok ? "ok" : "failed"), c.level === "fail");
        }
        if (!d.checks?.length) add("server: diagnostics", d.ok !== false, "backend reported no checks", false);
      } catch (e) {
        add("server: diagnostics", false, (e as Error).message);
      }
    }
  }

  const baton = readBaton(root);
  if (baton) add("handoff baton", true, `${baton.id} on ${baton.server} (pushed ${baton.pushedAt})`, false);

  if (flags.json) {
    ui.raw(JSON.stringify({ project: root, server: r.server, checks }, null, 2) + "\n");
  } else {
    const k = colorize(ui.fancy);
    const width = Math.max(...checks.map((c) => c.name.length)) + 2;
    for (const c of checks) {
      const mark = c.ok ? k.ok("✓") : c.blocking ? k.bad("✗") : k.warn("!");
      const name = c.ok ? pad(c.name, width) : k.bold(pad(c.name, width));
      ui.raw(`${mark} ${name}${k.dim(c.detail)}\n`);
    }
    ui.raw(`\n${k.dim("target:")} ${r.server ?? "(no backend)"} → ${remoteProjectPath(cfg, root)}\n`);
  }
  return checks.some((c) => !c.ok && c.blocking) ? 1 : 0;
}
