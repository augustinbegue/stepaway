import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { bashAsync, run, shq } from "../sh.js";
import { capturedSessionId, slugFor } from "@stepaway/core";
import { clearBaton, openClient, projectRoot, readBaton } from "../config.js";
import { buildManifest, existingSlugDir, rewriteSessions } from "../capture.js";
import { restoreLocal } from "../restore.js";
import { Ui } from "../ui.js";

/**
 * `GET /archive` → local untar → restore → `DELETE /sessions/:id`.
 * The archive is exactly the capture tar the backend produced on the runner
 * with the same embedded script, so the local half is unchanged from v0.1.
 */
export async function cmdPull(args: string[], flags: Record<string, any>): Promise<number> {
  const ui = Ui.from(flags);
  const dir = args[0] ?? process.cwd();
  const root = projectRoot(dir);
  const baton = readBaton(root);
  const sessionId = flags.session ? String(flags.session) : baton?.id;
  if (!sessionId) {
    ui.error(`no handoff baton for ${root}`, "pass --session <id>, or push from here first");
    return 1;
  }
  const opened = openClient(root, flags, baton?.server);
  if (!opened.client) {
    ui.error("no backend configured", opened.error);
    return 1;
  }
  const client = opened.client;

  ui.intro(`stepaway pull  ${path.basename(root)}`);

  // dirty-check policy
  const localDirty = run("git", ["status", "--porcelain"], { cwd: root }).stdout.trim();
  if (localDirty && !flags.overwrite) {
    const n = localDirty.split("\n").length;
    if (baton) {
      ui.error(
        `local tree is dirty (${n} file(s)) and this project was handed off ${baton.pushedAt}`,
        "cloud is the source of truth after a handoff: the runner's state will replace local changes.\n" +
          "re-run with --overwrite to proceed.",
      );
    } else {
      ui.error(
        `local tree is dirty (${n} file(s)) and there is no handoff baton for this project`,
        "commit/stash first, or re-run with --overwrite.",
      );
    }
    return 1;
  }

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

  const stamp = Date.now();
  const capDirName = `stepaway-pull-${stamp}`;
  const localTar = path.join(os.tmpdir(), `${capDirName}.tar.gz`);

  const xfer = ui.spinner(`fetching the archive from ${client.server}`);
  let bytes = 0;
  try {
    bytes = await client.downloadArchive(sessionId, localTar);
  } catch (e) {
    xfer.fail(`archive download failed: ${(e as Error).message}`);
    fs.rmSync(localTar, { force: true });
    return 1;
  }

  // the archive's top-level dir is whatever the backend named it; unpack into
  // a directory of ours and take the single entry inside.
  const unpackRoot = path.join(os.tmpdir(), capDirName);
  fs.rmSync(unpackRoot, { recursive: true, force: true });
  fs.mkdirSync(unpackRoot, { recursive: true });
  const un = await bashAsync(`set -e; tar xzf ${shq(localTar)} -C ${shq(unpackRoot)}`);
  if (un.code !== 0) {
    xfer.fail(`untar failed: ${lastLine(un.stderr)}`);
    fs.rmSync(localTar, { force: true });
    fs.rmSync(unpackRoot, { recursive: true, force: true });
    return 1;
  }
  xfer.stop(`transferred home (${Math.max(1, Math.round(bytes / 1024))} KiB)`);

  const capDir = captureDirIn(unpackRoot);
  if (!capDir) {
    ui.error("the archive did not contain a capture directory", "the backend may have sent an empty archive");
    fs.rmSync(localTar, { force: true });
    fs.rmSync(unpackRoot, { recursive: true, force: true });
    return 1;
  }
  const m = buildManifest(capDir);

  // rewrite transcripts back to the local path; store under the local slug
  rewriteSessions(capDir, m.captured.project_path, root);
  const localSlug = existingSlugDir(os.homedir(), root) ?? slugFor(root);

  const rspin = ui.spinner("restoring locally");
  const rest = await restoreLocal(capDir, root, m.captured.branch, localSlug);
  ui.detail(rest.stdout);
  if (rest.code !== 0) {
    rspin.fail(`restore failed: ${lastLine(rest.stderr || rest.stdout)}`);
    return 1;
  }
  rspin.stop(`restored ${m.captured.branch} into ${root}`);

  const sid = capturedSessionId(m) ?? baton?.sessionId ?? null;
  fs.rmSync(unpackRoot, { recursive: true, force: true });
  fs.rmSync(localTar, { force: true });
  clearBaton(root);

  // the handoff is over: the pod and its PVC go away
  const dspin = ui.spinner(`deleting the runner and its PVC`);
  try {
    await client.deleteSession(sessionId);
    dspin.stop("runner deleted");
  } catch (e) {
    dspin.fail(`could not delete the session: ${(e as Error).message}`);
    ui.warn(`your work is home; clean up later with: stepaway destroy --session ${sessionId}`);
  }

  ui.outro(
    `pulled ${client.server} (${sessionId}) → ${root}\n` +
      `  branch ${m.captured.branch} @ ${m.captured.head.slice(0, 12)}, ` +
      `${m.captured.dirty_file_count} dirty file(s), ${m.captured.session_ids.length} transcript(s)\n` +
      (sid ? `  resume:  claude --resume ${sid}\n` : "") +
      `  docker volumes on the runner are NOT pulled back — they died with the pod.`,
  );
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, sessionId: sid, deleted: sessionId, manifest: m }, null, 2) + "\n");
  }
  return 0;
}

/** The capture dir inside the unpacked archive (tar may or may not nest it). */
function captureDirIn(unpackRoot: string): string | null {
  if (fs.existsSync(path.join(unpackRoot, "meta"))) return unpackRoot;
  for (const e of fs.readdirSync(unpackRoot)) {
    const p = path.join(unpackRoot, e);
    if (fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, "meta"))) return p;
  }
  return null;
}

/** Errors from remote scripts can be pages long; the last line is the news. */
function lastLine(s: string): string {
  const lines = s.trim().split("\n").filter((l) => l.trim());
  return lines.length ? lines[lines.length - 1] : "(no output)";
}
