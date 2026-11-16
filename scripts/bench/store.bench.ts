import { afterAll, beforeAll, describe, expect, it } from "bun:test";
// Performance budgets for the data layer, on a seeded workspace (10k notes in nested folders, a
// 5k-row database, a 2k-block document). Not part of the default test run. From the client root:
//
//   bun run bench           (sizes: BENCH_NOTES, BENCH_ROWS, BENCH_PROJECTS, BENCH_BLOCKS)
//
// It seeds a temporary database, runs every measurement and prints one line each (median, p95,
// budget, ok/OVER); a median over budget fails the run. `bun run seed --out <file>` writes the
// same seeded database for manual testing.
//
// Budgets are generous on purpose (CI machines vary) except the interaction budget: one operation
// plus the watched-query notification that repaints it must fit in a 16 ms frame.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ViewWindowInput } from "@lydie/contract";
import { createRuntime } from "@lydie/runtime";
import type { Runtime } from "@lydie/runtime";
import { queries } from "@lydie/store";
import type { LiveQuery, Store, StoreQuery } from "@lydie/store";
import { openNodeStore } from "@lydie/store/node";

import { seedWorkspace } from "../seed/seed.ts";
import type { SeedResult } from "../seed/seed.ts";

const NOTES = Number(process.env.BENCH_NOTES ?? 10_000);
const ROWS = Number(process.env.BENCH_ROWS ?? 5_000);
const PROJECTS = Number(process.env.BENCH_PROJECTS ?? 1_000);
const BLOCKS = Number(process.env.BENCH_BLOCKS ?? 2_000);
const FRAME_MS = 16;

type Stats = { median: number; p95: number; min: number; runs: number };
const results: Record<string, Stats & { budget: number; unit?: string }> = {};

// PowerSync's Node pool hands reads to its five connections in turn, each with its own page
// cache: with fewer warm-up runs than connections, the first measured runs on the cold ones were
// the outliers that made p95.
const WARMUP = 6;

async function sample(
  fn: (i: number) => Promise<number>,
  runs = 20,
  warmup = WARMUP,
): Promise<Stats> {
  for (let i = 0; i < warmup; i++) await fn(-1 - i);
  // A collection left over from the previous measurement lands in this one otherwise.
  Bun.gc(true);
  const times: number[] = [];
  for (let i = 0; i < runs; i++) times.push(await fn(i));
  times.sort((a, b) => a - b);
  return {
    median: times[Math.floor(times.length / 2)]!,
    // Nearest rank: the 19th of 20 runs, not the slowest.
    p95: times[Math.max(0, Math.ceil(times.length * 0.95) - 1)]!,
    min: times[0]!,
    runs,
  };
}

function measure(fn: (i: number) => Promise<unknown>, runs = 20, warmup = WARMUP): Promise<Stats> {
  return sample(
    async (i) => {
      const t = performance.now();
      await fn(i);
      return performance.now() - t;
    },
    runs,
    warmup,
  );
}

// Counts the statements the store runs and tells when it has gone quiet: the reads of live
// queries after a write, which the write's own promise does not wait for.
function trackReads(target: Store) {
  const db = target.db as unknown as Record<
    "get" | "getAll",
    (...a: unknown[]) => Promise<unknown>
  >;
  let inFlight = 0;
  let started = 0;
  let lastStart = 0;
  let lastEnd = 0;
  const originals = { get: db.get, getAll: db.getAll };
  for (const name of ["get", "getAll"] as const) {
    const original = originals[name].bind(target.db);
    db[name] = async (...args: unknown[]) => {
      inFlight++;
      started++;
      lastStart = performance.now();
      try {
        return await original(...args);
      } finally {
        inFlight--;
        lastEnd = performance.now();
      }
    };
  }
  return {
    reset() {
      started = 0;
      lastEnd = 0;
    },
    get statements() {
      return started;
    },
    get lastEnd() {
      return lastEnd;
    },
    // Nothing running and nothing started for `idleMs`.
    async quiet(idleMs = 10) {
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, idleMs));
        if (inFlight === 0 && performance.now() - lastStart >= idleMs) return;
      }
    },
    restore() {
      db.get = originals.get;
      db.getAll = originals.getAll;
    },
  };
}

// A count per run (statements), reported like a measurement.
function counted(name: string, counts: number[], budget: number) {
  counts.sort((a, b) => a - b);
  results[name] = {
    median: counts[Math.floor(counts.length / 2)]!,
    p95: counts[Math.ceil(counts.length * 0.95) - 1]!,
    min: counts[0]!,
    runs: counts.length,
    budget,
  };
}

function record(name: string, stats: Stats, budget: number) {
  results[name] = { ...stats, budget };
  expect(
    stats.median,
    `${name}: median ${stats.median.toFixed(2)} ms over budget ${budget} ms`,
  ).toBeLessThan(budget);
}

function waitFor<T>(live: LiveQuery<T>, predicate: (rows: readonly T[]) => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const check = () => {
      if (live.state.isLoading || !predicate(live.state.data)) return;
      clearTimeout(timer);
      off();
      resolve();
    };
    const timer = setTimeout(() => {
      off();
      reject(new Error("watched query never reflected the change"));
    }, 5000);
    const off = live.subscribe(check);
    check();
  });
}

let dir: string;
let path: string;
let store: Store;
let runtime: Runtime;
let seed: SeedResult;
let importMs = 0;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "lydie-bench-"));
  path = join(dir, "bench.sqlite");
  const seeding = await openNodeStore({ path });
  seed = await seedWorkspace(seeding, {
    notes: NOTES,
    dbRows: ROWS,
    projectRows: PROJECTS,
    blocks: BLOCKS,
  });
  importMs = seed.ms.notes + seed.ms.rows;
  await seeding.close();
}, 600_000);

afterAll(async () => {
  await store?.close();
  rmSync(dir, { recursive: true, force: true });
  // One line per measurement: median, p95, budget, and whether the median is within it.
  const width = Math.max(...Object.keys(results).map((n) => n.length));
  const num = (v: number) => v.toFixed(v >= 100 ? 0 : 2).padStart(8);
  const lines = [
    `${"measurement".padEnd(width)}   median      p95   budget`,
    ...Object.entries(results).map(
      ([name, r]) =>
        `${name.padEnd(width)} ${num(r.median)} ${num(r.p95)} ${String(r.budget).padStart(8)}  ${
          r.median < r.budget ? "ok" : "OVER"
        }`,
    ),
  ];
  console.log(
    `\n${NOTES} notes, ${ROWS} database rows, ${PROJECTS} projects, ${BLOCKS}-block document\n`,
  );
  console.log(lines.join("\n"));
  console.log(
    `bulk import: ${Math.round(((NOTES + ROWS + PROJECTS) / importMs) * 1000)} documents/s`,
  );
});

describe(`store with ${NOTES} notes, ${ROWS} database rows, ${PROJECTS} related rows, ${BLOCKS} blocks`, () => {
  it("bulk import", () => {
    const docs = NOTES + ROWS + PROJECTS;
    const perSecond = (docs / importMs) * 1000;
    results["bulk import (ms per 1000 docs)"] = {
      median: (importMs / docs) * 1000,
      p95: (importMs / docs) * 1000,
      min: (importMs / docs) * 1000,
      runs: 1,
      budget: 2000,
    };
    expect(perSecond).toBeGreaterThan(500);
  });

  it("opens an existing database", async () => {
    const stats = await measure(
      async () => {
        const s = await openNodeStore({ path });
        await s.close();
      },
      5,
      1,
    );
    record("open existing database", stats, 1500);
    store = await openNodeStore({ path });
    runtime = createRuntime({ ...store.ports, actor: { type: "user", id: "bench" } });
  });

  it("lists the tree", async () => {
    const ws = seed.workspaceId;
    record("listTree, full (all docs)", await measure(() => store.listTree(ws), 5, 1), 400);
    record(
      "children of top level",
      await measure(() => store.query(queries.children(ws, null))),
      60,
    );
    record(
      "children of a folder",
      await measure(() => store.query(queries.children(ws, seed.folders[3]!))),
      10,
    );
    // The same through the runtime (doc.listChildren): one read, not one per child.
    record(
      "doc.listChildren op, top level",
      await measure(() => runtime.ops.doc.listChildren({ workspaceId: ws })),
      60,
    );
    record(
      "doc.listChildren op, a folder",
      await measure(() =>
        runtime.ops.doc.listChildren({ workspaceId: ws, parentId: seed.folders[3]! }),
      ),
      10,
    );
    // A sidebar with three folders open.
    const expanded = [seed.folders[0]!, seed.folders[1]!, seed.folders[2]!];
    record(
      "listTree, 3 folders expanded",
      await measure(() => store.listTree(ws, { expanded })),
      60,
    );
  });

  it("searches", async () => {
    const ws = seed.workspaceId;
    record(
      "search one word",
      await measure((i) => store.search(ws, ["garden", "budget", "tomato"][Math.abs(i) % 3]!)),
      50,
    );
    record("search two words", await measure(() => store.search(ws, "roadmap review")), 50);
  });

  it("lists links", async () => {
    const ws = seed.workspaceId;
    record("backlinks of the hub (~1.4k)", await measure(() => store.backlinks(seed.hubId)), 60);
    record(
      "backlinks of a note",
      await measure((i) => store.backlinks(seed.notes[500 + Math.abs(i)]!)),
      5,
    );
    record(
      "block backlinks",
      await measure((i) =>
        store.query(queries.blockBacklinks(seed.notes[100 + Math.abs(i)]!, "p1")),
      ),
      5,
    );
    record(
      "unresolved links (workspace)",
      await measure(() => store.query(queries.unresolvedLinks(ws)), 5),
      200,
    );
    record(
      "unlinked mentions of the hub",
      await measure(() => runtime.ops.doc.unlinkedMentions({ id: seed.hubId }), 5),
      200,
    );
  });

  it("filters and sorts the database", async () => {
    const ws = seed.workspaceId;
    record(
      "5k rows: filter status, sort priority",
      await measure(() =>
        store.query(
          queries.rows(ws, seed.databaseId, {
            filters: [{ key: "status", op: "eq", value: "todo" }],
            sorts: [{ key: "priority", direction: "desc" }, { key: "due" }],
            limit: 100,
          }),
        ),
      ),
      50,
    );
    record(
      "5k rows: contains tag, sort due",
      await measure(() =>
        store.query(
          queries.rows(ws, seed.databaseId, {
            filters: [{ key: "tags", op: "contains", value: "garden" }],
            sorts: [{ key: "due" }],
          }),
        ),
      ),
      50,
    );
  });

  it("applies one operation and repaints within a frame", async () => {
    const ws = seed.workspaceId;
    const folderA = seed.folders[3]!;
    const folderB = seed.folders[4]!;
    const docId = (
      await runtime.ops.doc.create({ workspaceId: ws, parentId: folderA, title: "Bench doc" })
    ).id;
    const inA = store.live(queries.children(ws, folderA));
    const inB = store.live(queries.children(ws, folderB));
    const doc = store.live(queries.getDoc(docId, { includeBody: false }));
    try {
      await waitFor(inA, (rows) => rows.some((r) => r.id === docId));
      await waitFor(inB, () => true);
      await waitFor(doc, (rows) => rows.length === 1);

      const opOnly = await measure(
        (i) => runtime.ops.doc.rename({ id: docId, title: `Op only ${i}` }),
        30,
      );
      record("doc.rename, operation only", opOnly, 8);

      const rename = await measure(async (i) => {
        const title = `Renamed ${i}`;
        const seen = Promise.all([
          waitFor(inA, (rows) => rows.some((r) => r.id === docId && r.title === title)),
          waitFor(doc, (rows) => rows[0]?.document.title === title),
        ]);
        await runtime.ops.doc.rename({ id: docId, title });
        await seen;
      }, 30);
      record("doc.rename + watched repaint", rename, FRAME_MS);

      let at = folderA;
      const move = await measure(async () => {
        const [from, to] = at === folderA ? [inA, inB] : [inB, inA];
        const target = at === folderA ? folderB : folderA;
        // Both sides must have repainted: in the target, and gone from the source.
        const seen = Promise.all([
          waitFor(to, (rows) => rows.some((r) => r.id === docId)),
          waitFor(from, (rows) => !rows.some((r) => r.id === docId)),
        ]);
        await runtime.ops.doc.move({ id: docId, parentId: target });
        await seen;
        at = target;
      }, 30);
      record("doc.move + watched repaint (both folders)", move, FRAME_MS);
      if (at !== folderA) await runtime.ops.doc.move({ id: docId, parentId: folderA });

      // Why the sidebar watches folders, not the whole tree: every change re-runs the full query.
      const tree = store.live(queries.listTree(ws));
      try {
        await waitFor(tree, (rows) => rows.length > 0);
        const full = await measure(
          async (i) => {
            const title = `Tree ${i}`;
            const seen = waitFor(tree, (rows) =>
              rows.some((r) => r.id === docId && r.title === title),
            );
            await runtime.ops.doc.rename({ id: docId, title });
            await seen;
          },
          5,
          1,
        );
        record("doc.rename + full-tree watcher repaint (not for UI)", full, 400);
      } finally {
        await tree.close();
      }

      // The same op into the 5k-row database (placing among 5k siblings).
      const intoDb = await measure(async (i) => {
        await runtime.ops.doc.move({
          id: docId,
          parentId: i % 2 === 0 ? seed.databaseId : folderA,
        });
      }, 20);
      record("doc.move among 5k siblings, operation only", intoDb, FRAME_MS);

      const undo = await measure(async () => {
        await runtime.ops.doc.rename({ id: docId, title: "Before undo" });
        await runtime.history.undo();
      }, 20);
      record("rename + undo, operations only", undo, 2 * FRAME_MS);
    } finally {
      await inA.close();
      await inB.close();
      await doc.close();
    }
  });

  it("runs database views", async () => {
    const TODAY = "2026-06-15";
    const view = (viewId: string, window: ViewWindowInput = { limit: 100 }, extra = {}) =>
      store.queryView({
        databaseId: seed.databaseId,
        viewId,
        window,
        me: seed.me,
        today: TODAY,
        ...extra,
      });
    const { views, properties: p } = seed;

    const mine = await view(views.mine!);
    expect(mine.total).toBeGreaterThan(300);
    expect(mine.groups.length).toBe(4);
    record(
      "view: filter + sort + group, window 100 of 5k",
      await measure(() => view(views.mine!)),
      FRAME_MS,
    );
    record(
      "view: board by status, one column",
      await measure(() => view(views.board!, { limit: 50, group: "doing" })),
      FRAME_MS,
    );
    record(
      "view: grouped by tag (list values), window 100",
      await measure(() => view(views.byTag!)),
      FRAME_MS,
    );
    record(
      "view: sorted by due, window at offset 4000",
      await measure(() => view(views.table!, { offset: 4000, limit: 100 })),
      FRAME_MS,
    );
    record(
      "view: calendar, one month",
      await measure(() =>
        view(views.calendar!, { limit: 1000, range: { start: "2026-06-01", end: "2026-07-01" } }),
      ),
      FRAME_MS,
    );
    record(
      "database.query operation (runtime → SQL)",
      await measure(() =>
        runtime.ops.database.query({
          databaseId: seed.databaseId,
          viewId: views.mine!,
          today: TODAY,
        }),
      ),
      FRAME_MS,
    );
    record(
      "view sorted by a formula (JavaScript over 5k)",
      await measure(
        () =>
          store.queryView({
            databaseId: seed.databaseId,
            view: { config: { sorts: [{ propertyId: p.cost!, direction: "desc" }] } },
            me: seed.me,
            today: TODAY,
          }),
        5,
        1,
      ),
      150,
    );

    // What the relation, rollup and formula columns cost: the same view without them.
    const withComputed = await measure(() => view(views.table!));
    const computedIds = [p.project!, p.project_budget!, p.cost!];
    for (const id of computedIds.slice().reverse()) {
      await runtime.execute("database.deleteProperty", { id }, { history: false });
    }
    const without = await measure(() => view(views.table!));
    for (const id of computedIds) {
      await runtime.execute("database.restoreProperty", { id }, { history: false });
    }
    // Reported as the difference: what the columns add to the same view.
    results["view: relation + rollup + formula columns add (window 100)"] = {
      median: withComputed.median - without.median,
      p95: withComputed.p95 - without.p95,
      min: withComputed.min - without.min,
      runs: withComputed.runs,
      budget: 10,
    };
    expect(withComputed.median - without.median).toBeLessThan(10);

    record(
      "open a view (live, until first data)",
      await measure(async () => {
        const live = store.liveView({
          databaseId: seed.databaseId,
          viewId: views.mine!,
          me: seed.me,
          today: TODAY,
        });
        await waitFor(live, (items) => items.length > 0);
        await live.close();
      }, 10),
      30,
    );

    // A filter change: the UI opens the view again with the new (unsaved) filter.
    for (const [name, viewId] of [
      ["grouped + sorted", views.mine!],
      ["sorted by due", views.table!],
    ] as const) {
      record(
        `view: filter change, live until data (${name})`,
        await measure(async (i) => {
          const live = store.liveView({
            databaseId: seed.databaseId,
            viewId,
            view: {
              config: {
                filter: { type: "condition", propertyId: p.estimate!, op: "gt", value: i % 8 },
              },
            },
            window: { limit: 100 },
            me: seed.me,
            today: TODAY,
          });
          await waitFor(live, (items) => items.length > 0);
          await live.close();
        }, 20),
        FRAME_MS,
      );
    }

    const live = store.liveView({
      databaseId: seed.databaseId,
      viewId: views.table!,
      window: { limit: 100 },
      today: TODAY,
    });
    try {
      await waitFor(live, (items) => items.length > 0);
      const first = live.result!.rows[10]!;
      const repaint = await measure(async (i) => {
        const value = 1000 + i;
        const seen = waitFor(live, () =>
          live.result!.rows.some((r) => r.id === first.id && r.properties.estimate === value),
        );
        await runtime.ops.database.setValues({
          databaseId: seed.databaseId,
          rowIds: [first.id],
          set: { [p.estimate!]: value },
        });
        await seen;
      }, 30);
      record("database.setValues + live view repaint", repaint, FRAME_MS);
      const opOnly = await measure(
        (i) =>
          runtime.ops.database.setValues({
            databaseId: seed.databaseId,
            rowIds: [first.id],
            set: { [p.estimate!]: 2000 + i },
          }),
        30,
      );
      record("database.setValues, operation only", opOnly, 8);
    } finally {
      await live.close();
    }

    const batch = seed.rows.slice(0, 500);
    record(
      "bulk setValues on 500 rows (one step)",
      await measure(
        (i) =>
          runtime.ops.database.setValues({
            databaseId: seed.databaseId,
            rowIds: batch,
            set: { [p.status!]: i % 2 === 0 ? "blocked" : "doing" },
          }),
        10,
        2,
      ),
      100,
    );
    record(
      "undo of the 500-row bulk update",
      await measure(
        async (i) => {
          await runtime.ops.database.setValues({
            databaseId: seed.databaseId,
            rowIds: batch,
            set: { [p.status!]: i % 2 === 0 ? "todo" : "done" },
          });
          await runtime.history.undo();
        },
        5,
        1,
      ),
      250,
    );
    record(
      "two-way relation change (both sides)",
      await measure((i) =>
        runtime.ops.database.setValues({
          databaseId: seed.databaseId,
          rowIds: [seed.rows[i + 100]!],
          set: { [p.project!]: [seed.projects[i + 3]!] },
        }),
      ),
      FRAME_MS,
    );
  });

  it("writes a long body", async () => {
    const { body } = await runtime.ops.doc.get({ id: seed.longDocId });
    const markdown = body!.markdown;
    record(
      "updateBody, 2k-block document",
      await measure(
        (i) =>
          runtime.ops.doc.updateBody({ id: seed.longDocId, markdown: `${markdown}\nEdit ${i}.` }),
        10,
      ),
      100,
    );
    record(
      "updateBody, small edit on a note",
      await measure((i) =>
        runtime.ops.doc.updateBody({
          id: seed.notes[42]!,
          markdown: `# Note\n\nEdited ${i} [[Hub]]`,
        }),
      ),
      FRAME_MS,
    );
  });

  it("saves a body with the queries a window has open", async () => {
    const ws = seed.workspaceId;
    const edited = seed.notes[42]!;
    const title = (await store.getDoc(edited, { includeBody: false }))!.document.title;
    // While someone types: eight pooled tabs (body, links, access), the sidebar (top level and
    // three folders), Home's recent pages, and the links panel of the page being edited. The
    // workspace-wide ones run here on every save, as after a pause in typing (the app's backend
    // re-runs them at most every 1.5 s).
    const open = [
      ...[edited, ...seed.notes.slice(1000, 1007)].flatMap((id) => [
        queries.getDoc(id, { includeBody: true }),
        queries.outgoingLinks(id, { icons: true }),
        queries.myAccess(id),
      ]),
      queries.children(ws, null),
      ...seed.folders.slice(0, 3).map((folder) => queries.children(ws, folder)),
      queries.recent(ws),
      queries.backlinks(edited),
      queries.unlinkedMentions(ws, edited, [title]),
    ];
    const lives = open.map((q) => store.live(q as StoreQuery<unknown>));
    const reads = trackReads(store);
    const statements: number[] = [];
    try {
      for (const live of lives) await waitFor(live, () => true);
      const body = lives[0] as LiveQuery<{ body: { markdown: string } | null }>;
      const save = await sample(async (i) => {
        await reads.quiet();
        reads.reset();
        const markdown = `# Note\n\nTyping ${i} [[Hub]]`;
        const seen = waitFor(body, (rows) => rows[0]?.body?.markdown === markdown);
        const t = performance.now();
        await runtime.execute("doc.updateBody", { id: edited, markdown }, { history: false });
        await seen;
        await reads.quiet();
        if (i >= 0) statements.push(reads.statements);
        return Math.max(reads.lastEnd, t) - t;
      });
      record(`updateBody + ${open.length} live queries settle`, save, FRAME_MS);
      counted("updateBody: statements live queries run per save (count)", statements, 10);

      // Typing in the title (a `documents` change, as when a save stamps `updated_at`).
      statements.length = 0;
      const rename = await sample(async (i) => {
        await reads.quiet();
        reads.reset();
        const t = performance.now();
        await runtime.execute(
          "doc.rename",
          { id: edited, title: `${title} ${i}` },
          { history: false },
        );
        await reads.quiet();
        if (i >= 0) statements.push(reads.statements);
        return Math.max(reads.lastEnd, t) - t;
      });
      record(`doc.rename + ${open.length} live queries settle`, rename, FRAME_MS);
      counted("doc.rename: statements live queries run (count)", statements, 20);
    } finally {
      reads.restore();
      for (const live of lives) await live.close();
    }
  });
});
