import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/** Locate a file shipped in the package (skill/) from dist/ or src/. */
export function packageFile(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cands = [
    path.join(here, "..", rel), // dist/ -> package root
    path.join(here, "..", "..", rel), // src/ -> package root (bun run src)
    path.join(process.cwd(), rel),
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error(`packaged file not found: ${rel} (looked in ${cands.join(", ")})`);
}
