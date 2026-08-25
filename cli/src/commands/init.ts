import * as fs from "node:fs";
import { remoteProjectPath } from "@stepaway/core";
import { configPath, loadConfig, patchConfig, projectRoot, resolveConfig } from "../config.js";
import { detectSetup } from "../setup.js";
import { findComposeFile } from "../docker.js";
import { readClientConfig } from "../clientconfig.js";
import { Ui } from "../ui.js";

/**
 * Write `.stepaway.json`. v0.2: no namespace/pod/context — the CLI addresses a
 * backend, not a cluster. The only endpoint key here is an optional per-project
 * `server` override; the usual place for the endpoint (and the only place for
 * the token) is the global ~/.config/stepaway/config.json.
 */
export async function cmdInit(args: string[], flags: Record<string, any>): Promise<number> {
  const ui = Ui.from(flags);
  const root = projectRoot(args[0] ?? process.cwd());
  const p = configPath(root);
  const existed = fs.existsSync(p);
  const cfg = resolveConfig(root, flags);

  // Only ever write the knobs; never write env.overrideVars (it holds values,
  // and .stepaway.json is a file people commit).
  const patch: Record<string, any> = {
    remotePathBase: cfg.remotePathBase,
    excludeGlobs: cfg.excludeGlobs,
  };
  if (cfg.server) patch.server = cfg.server;
  const compose = findComposeFile(root, cfg.composeFile);
  if (compose) patch.composeFile = compose;
  if (cfg.setup !== null) patch.setup = cfg.setup;
  patchConfig(root, patch);

  const setup = cfg.setup ?? detectSetup(root);
  const global = readClientConfig();
  if (flags.json) {
    ui.raw(JSON.stringify({ path: p, updated: existed, config: loadConfig(root) }, null, 2) + "\n");
  } else {
    ui.raw(
      `${existed ? "updated" : "wrote"} ${p}\n` +
        `  backend: ${cfg.server ?? global.server ?? "(none yet — run stepaway auth)"}\n` +
        `  remote working tree: ${remoteProjectPath(cfg, root)} (one pod per session)\n` +
        `  compose file: ${compose ?? "(none)"}\n` +
        `  setup: ${setup ?? "(none detected)"}\n` +
        `next: stepaway auth, then stepaway doctor\n`,
    );
  }
  return 0;
}
