// Writes the demo workspace (demo.ts) into a folder of Markdown files, through the file bridge, so
// the folder looks exactly as if someone had used Lydie on it: notes, `.base` databases, `.lydie/`.
//
//   bun client/scripts/seed/demo-folder.ts --out ~/Documents/Maya [--today 2026-11-13] [--existing]
//
// The folder must be empty or not exist, unless --existing is given: then the demo is added beside
// what is there (an app that has the folder open picks the files up). Open it in the desktop app
// afterwards.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { openVault } from "@lydie/bridge-fs";

import { seedDemo } from "./demo.ts";

const { values } = parseArgs({
  options: {
    out: { type: "string" },
    today: { type: "string" },
    existing: { type: "boolean", default: false },
  },
});

if (!values.out) {
  console.error(
    "Usage: bun client/scripts/seed/demo-folder.ts --out <folder> [--today YYYY-MM-DD] [--existing]",
  );
  process.exit(1);
}
const folder = resolve(values.out.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
if (!values.existing && existsSync(folder) && readdirSync(folder).length > 0) {
  console.error(`${folder} is not empty. Pick a new folder, or pass --existing to add to it.`);
  process.exit(1);
}
mkdirSync(folder, { recursive: true });

// The index database is throwaway: the folder is the source of truth, and the app builds its own.
const dataDir = mkdtempSync(join(tmpdir(), "lydie-demo-"));
const vault = await openVault({ folder, dataDir, watch: false });
try {
  const result = await seedDemo(vault.runtime.ops, {
    workspaceId: vault.workspaceId,
    ...(values.today ? { today: values.today } : {}),
  });
  await vault.bridge.idle();
  console.log(`Wrote ${result.documents} documents (${result.databases} databases) to ${folder}`);
} finally {
  await vault.close();
  rmSync(dataDir, { recursive: true, force: true });
}
