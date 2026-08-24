import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { packageFile } from "../pkg.js";

export async function cmdSkill(args: string[], flags: Record<string, any>): Promise<number> {
  const sub = args[0] ?? "install";
  if (sub !== "install") {
    process.stderr.write(`unknown skill subcommand: ${sub}\nusage: stepaway skill install\n`);
    return 1;
  }
  const src = packageFile(path.join("skill", "stepaway"));
  const dst = path.join(os.homedir(), ".claude", "skills", "stepaway");
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(src, dst, { recursive: true });
  if (flags.json) process.stdout.write(JSON.stringify({ installed: dst }, null, 2) + "\n");
  else
    process.stdout.write(
      `installed skill -> ${dst}\nsay "hand this off" in Claude Code to use it (restart the session to pick it up)\n`,
    );
  return 0;
}
