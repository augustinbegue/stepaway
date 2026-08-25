import { describe, expect, it } from "bun:test";
import { CAPTURE_SH, slugCandidates } from "../src/index.js";

/**
 * slugCandidates() and the SLUG loop inside CAPTURE_SH are two spellings of one
 * rule: if they ever drift, `push` picks a different transcript directory than
 * the capture script does and the session silently stops travelling.
 *
 * So: run the *actual* sed pipeline out of CAPTURE_SH (bash 3.2 constructs
 * only, same as the script) and require it to agree candidate for candidate.
 */

/** The three sed expressions, lifted verbatim from CAPTURE_SH. */
const SED_EXPRS = ["s|[/.]|-|g", "s|/|-|g", "s|[^a-zA-Z0-9]|-|g"];

it("CAPTURE_SH still contains the slug loop this test mirrors", () => {
  for (const e of SED_EXPRS) expect(CAPTURE_SH).toContain(`sed '${e}'`);
});

async function bashSlugs(projPath: string): Promise<string[]> {
  const script = `
PROJ="$1"
for cand in \\
  "$(printf '%s' "$PROJ" | sed '${SED_EXPRS[0]}')" \\
  "$(printf '%s' "$PROJ" | sed '${SED_EXPRS[1]}')" \\
  "$(printf '%s' "$PROJ" | sed '${SED_EXPRS[2]}')"; do
  printf '%s\\n' "$cand"
done
`;
  const p = Bun.spawn(["bash", "-c", script, "stepaway", projPath], { stdout: "pipe" });
  const out = await new Response(p.stdout).text();
  await p.exited;
  return out.replace(/\n$/, "").split("\n");
}

const PATHS = [
  "/Users/ab/code/stepaway",
  "/Users/ab/code/my.project",
  "/Users/ab/code/my-project.v2",
  "/home/node/.claude/worktrees/feat-x",
  "/tmp/a.b.c/d-e_f/g h",
  "/workspace/handoff",
  "/w/UPPER.Case-99",
];

describe("slug parity: slugCandidates() vs the CAPTURE_SH sed loop", () => {
  for (const p of PATHS) {
    it(p, async () => {
      expect(await bashSlugs(p)).toEqual(slugCandidates(p));
    });
  }
});
