// Writes the registry projections to `generated/`. With `--check`, fails instead if any file drifted.
// The output is formatted exactly as `bun fmt` would, so the repo-wide format check stays green.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { generatedFiles, operations } from "../src/index.ts";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "generated");
const check = process.argv.includes("--check");

function format(fileName: string, value: unknown): string {
  const result = spawnSync(
    process.execPath,
    ["fmt", `--stdin-filepath=${join(outDir, fileName)}`],
    {
      input: `${JSON.stringify(value, null, 2)}\n`,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    throw new Error(`bun fmt failed for ${fileName}: ${result.stderr || result.error?.message}`);
  }
  return result.stdout;
}

const drifted: string[] = [];
mkdirSync(outDir, { recursive: true });
for (const [fileName, value] of Object.entries(generatedFiles(operations))) {
  const path = join(outDir, fileName);
  const next = format(fileName, value);
  const current = existsSync(path) ? readFileSync(path, "utf8") : undefined;
  if (current === next) continue;
  if (check) drifted.push(fileName);
  else {
    writeFileSync(path, next);
    console.log(`wrote generated/${fileName}`);
  }
}

if (drifted.length > 0) {
  console.error(
    `Generated files are out of date: ${drifted.join(", ")}.\n` +
      "Run `bun --filter=@lydie/contract run generate` and commit the result.",
  );
  process.exit(1);
}
if (check) console.log("generated/ is up to date");
