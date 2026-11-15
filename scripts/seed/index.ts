// Seeds a large workspace database for benchmarks and manual testing.
//
//   bun client/scripts/seed/index.ts --out /tmp/bench.sqlite [--notes 10000] [--db-rows 5000]
//     [--projects 1000] [--blocks 2000] [--seed 1] [--workspace bench]
//
// The output is deterministic for the same options. An existing file is replaced.
import { existsSync, rmSync } from "node:fs";
import { parseArgs } from "node:util";

import { openNodeStore } from "@lydie/store/node";

import { seedWorkspace } from "./seed.ts";

const { values } = parseArgs({
  options: {
    out: { type: "string" },
    notes: { type: "string", default: "10000" },
    "db-rows": { type: "string", default: "5000" },
    projects: { type: "string", default: "1000" },
    blocks: { type: "string", default: "2000" },
    seed: { type: "string", default: "1" },
    workspace: { type: "string", default: "bench" },
  },
});

if (!values.out) {
  console.error(
    "Usage: bun client/scripts/seed/index.ts --out <dbfile> [--notes N] [--db-rows N] [--projects N] [--blocks N]",
  );
  process.exit(1);
}

for (const suffix of ["", "-wal", "-shm"]) {
  if (existsSync(values.out + suffix)) rmSync(values.out + suffix);
}
const store = await openNodeStore({ path: values.out });
try {
  const result = await seedWorkspace(store, {
    workspaceId: values.workspace,
    notes: Number(values.notes),
    dbRows: Number(values["db-rows"]),
    projectRows: Number(values.projects),
    blocks: Number(values.blocks),
    seed: Number(values.seed),
    onProgress: (done, total) => process.stderr.write(`\r${done}/${total} documents`),
  });
  process.stderr.write("\n");
  const docs =
    result.folders.length + result.notes.length + result.rows.length + result.projects.length + 3;
  console.log(
    JSON.stringify(
      {
        out: values.out,
        workspaceId: result.workspaceId,
        documents: docs,
        ms: Object.fromEntries(Object.entries(result.ms).map(([k, v]) => [k, Math.round(v)])),
        docsPerSecond: Math.round((docs / result.ms.total) * 1000),
      },
      null,
      2,
    ),
  );
} finally {
  await store.close();
}
