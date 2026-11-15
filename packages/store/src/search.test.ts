import { afterEach, describe, expect, it } from "bun:test";

import { createRuntime, trigrams } from "@lydie/runtime";
import type { Runtime } from "@lydie/runtime";
import { createMemoryPorts } from "@lydie/runtime/memory";

import { closeTestStores, openTestStore } from "./test-utils.ts";

const WS = "ws1";
const actor = { type: "user", id: "u1" } as const;

afterEach(closeTestStores);

const TITLES = [
  "Onboarding checklist",
  "Q3-plan (draft)",
  "Launch plan",
  "Plan",
  "Meeting notes 2026",
  "  spaced   out ",
  "Ärger mit Ölpreisen",
];

async function seed(runtime: Runtime) {
  const ids: Record<string, string> = {};
  for (const title of TITLES) {
    ids[title] = (await runtime.ops.doc.create({ workspaceId: WS, title })).id;
  }
  const renamed = await runtime.ops.doc.create({ workspaceId: WS, title: "Draft" });
  await runtime.ops.doc.rename({ id: renamed.id, title: "Renamed later" });
  ids["Renamed later"] = renamed.id;
  await runtime.ops.doc.create({ workspaceId: WS, title: "Notes", markdown: "The plan for Q3." });
  await runtime.ops.doc.create({ workspaceId: "ws2", title: "Onboarding elsewhere" });
  const trashed = await runtime.ops.doc.create({ workspaceId: WS, title: "Onboarding old" });
  await runtime.ops.doc.delete({ id: trashed.id });
  return ids;
}

const titlesOf = async (runtime: Runtime, query: string) =>
  (await runtime.ops.doc.search({ workspaceId: WS, query })).hits.map((h) => h.title);

describe("search (LYD-389)", () => {
  it("prepares titles in SQLite so their trigrams are @lydie/runtime's", async () => {
    const { store, runtime } = await openTestStore();
    const ids = await seed(runtime);
    // The 3-character pieces of gram_text that a query trigram can be: no "|", not only spaces.
    const gramsOf = async (id: string) => {
      const [row] = await store.db.getAll<{ gram_text: string }>(
        "SELECT gram_text FROM doc_props WHERE id = ?",
        [id],
      );
      const chars = [...row!.gram_text];
      const pieces = chars.slice(2).map((_, i) => chars.slice(i, i + 3).join(""));
      return [...new Set(pieces.filter((g) => !g.includes("|") && g.trim()))].sort();
    };
    for (const title of [...TITLES, "Renamed later"]) {
      expect(await gramsOf(ids[title]!)).toEqual(trigrams(title).sort());
    }
    await store.rebuild();
    expect(await gramsOf(ids["Launch plan"]!)).toEqual(trigrams("Launch plan").sort());
  });

  it("puts exact titles first and falls back to similar titles, as the memory ports do", async () => {
    const sqlite = (await openTestStore()).runtime;
    const memory = createRuntime({ ...createMemoryPorts(), actor });
    await seed(sqlite);
    await seed(memory);
    for (const runtime of [sqlite, memory]) {
      const plans = await titlesOf(runtime, "plan");
      expect(plans[0]).toBe("Plan");
      expect(plans).toContain("Launch plan");
      expect(plans).not.toContain("Onboarding checklist");

      // Nothing contains "onbaording": the close title comes back without highlights, but not
      // the trashed one or the one in another workspace.
      const { hits } = await runtime.ops.doc.search({ workspaceId: WS, query: "onbaording" });
      expect(hits.map((h) => h.title)).toEqual(["Onboarding checklist"]);
      expect(hits[0]!.snippet).toBe("Onboarding checklist");
      expect(hits[0]!.score).toBeCloseTo(1 - 7 / 11);

      expect(await titlesOf(runtime, "lauch plan")).toEqual(["Launch plan"]);
      expect(await titlesOf(runtime, "Renamd")).toEqual(["Renamed later"]);
      expect(await titlesOf(runtime, "xyzzy")).toEqual([]);
    }
    // Real matches are ranked differently (bm25 against the memory ports' word counts), so only
    // the exact title and the fallback are compared.
    expect((await titlesOf(sqlite, "launch PLAN"))[0]).toBe("Launch plan");
    expect((await titlesOf(memory, "launch PLAN"))[0]).toBe("Launch plan");
    for (const query of ["onbaording", "meting notse", "olpreisen", "q3 plna", "spacd"]) {
      expect(await titlesOf(sqlite, query)).toEqual(await titlesOf(memory, query));
    }
  });
});
