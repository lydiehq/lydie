import { describe, expect, test } from "bun:test";

import type { Document } from "../entities.ts";
import { planFolder } from "./plan.ts";

const WS = "01900000-0000-0000-0000-000000007320";
let n = 0;
function doc(title: string, fields: Partial<Document> = {}): Document {
  const id = `00000000-0000-7000-8000-${String(++n).padStart(12, "0")}`;
  return {
    id,
    workspaceId: WS,
    parentId: null,
    title,
    sortKey: `a${n}`,
    properties: {},
    createdAt: "2026-11-15T00:00:00.000Z",
    updatedAt: "2026-11-15T00:00:00.000Z",
    deletedAt: null,
    ...fields,
  };
}

const paths = (plan: ReturnType<typeof planFolder>) => plan.entries.map((e) => e.path);

describe("planFolder", () => {
  test("names are unique case-insensitively and keep out of the attachments folder", () => {
    const a = doc("Plan");
    const b = doc("plan");
    const c = doc("Attachments");
    const plan = planFolder({
      workspaceId: WS,
      documents: [a, b, c],
      databases: [],
      attachments: [],
    });
    expect(paths(plan)).toEqual(["Plan.md", "plan 1.md", "Attachments 1.md"]);
  });

  test("a document whose parent is not exported goes to the top level", () => {
    const hidden = doc("Hidden");
    const shared = doc("Shared", { parentId: hidden.id });
    const gone = doc("Gone", { deletedAt: "2026-11-15T00:00:00.000Z" });
    const plan = planFolder({
      workspaceId: WS,
      documents: [shared, gone],
      databases: [],
      attachments: [],
    });
    expect(paths(plan)).toEqual(["Shared.md"]);
  });

  test("ids go into the file, or into ids.json when `id` is a property", () => {
    const own = doc("Own", { properties: { id: "custom" } });
    const plain = doc("Plain");
    const plan = planFolder({
      workspaceId: WS,
      documents: [own, plain],
      databases: [],
      attachments: [],
    });
    const notes = plan.entries.filter((e) => e.kind === "note");
    expect(notes.map((e) => e.head)).toEqual([
      "---\nid: custom\n---\n",
      `---\nid: ${plain.id}\n---\n`,
    ]);
    expect(plan.meta().find((m) => m.path === ".lydie/ids.json")?.text).toBe(
      `${JSON.stringify({ Own: own.id }, null, 2)}\n`,
    );
  });

  test("attachment rows with missing bytes are left out of attachments.json", () => {
    const a = {
      id: "01900000-0000-0000-0000-000000000141",
      workspaceId: WS,
      documentId: null,
      filename: "a.png",
      contentType: "image/png",
      size: 1,
      sha256: "a".repeat(64),
      createdAt: "2026-11-15T00:00:00.000Z",
      updatedAt: "2026-11-15T00:00:00.000Z",
      deletedAt: null,
    };
    const plan = planFolder({ workspaceId: WS, documents: [], databases: [], attachments: [a] });
    expect(paths(plan)).toEqual(["attachments/a.png"]);
    expect(plan.meta(new Set()).map((m) => m.path)).toEqual([".lydie/workspace.json"]);
    expect(plan.meta().map((m) => m.path)).toContain(".lydie/attachments.json");
  });

  test("sections put top-level documents in a folder each, in their order, after the others", () => {
    const roadmap = doc("Roadmap");
    const budget = doc("Budget", { parentId: roadmap.id });
    const diary = doc("Diary");
    const loose = doc("Loose");
    const shared = doc("Private");
    const space: Record<string, string> = {
      [roadmap.id]: "ts-zeta",
      [diary.id]: "private",
      [shared.id]: "private",
      [loose.id]: "gone",
    };
    const plan = planFolder({
      workspaceId: WS,
      documents: [roadmap, budget, diary, loose, shared],
      databases: [],
      attachments: [],
      sections: {
        list: [
          { id: "ts-empty", name: "Empty" },
          { id: "ts-zeta", name: "Zeta: team" },
          { id: "private", name: "Private" },
        ],
        of: (id) => space[id] ?? null,
      },
    });
    // Sections without documents get no folder; a section the list does not name is no section,
    // and its documents come first, at the top level.
    expect(paths(plan)).toEqual([
      "Loose.md",
      "Zeta- team/Roadmap.md",
      "Zeta- team/Roadmap/Budget.md",
      "Private/Diary.md",
      "Private/Private.md",
    ]);
    expect(plan.keyOf(budget.id)).toBe("Zeta- team/Roadmap/Budget");
    expect(plan.meta().find((m) => m.path === ".lydie/order.json")?.text).toBe(
      `${JSON.stringify({ "": ["Loose", "Zeta- team", "Private"] }, null, 2)}\n`,
    );
  });

  test("one shared space at the top level, beside a Private folder that keeps its name", () => {
    const plans = doc("Plans");
    const named = doc("Private");
    const diary = doc("Diary");
    const plan = planFolder({
      workspaceId: WS,
      documents: [plans, named, diary],
      databases: [],
      attachments: [],
      sections: {
        list: [{ id: "private", name: "Private" }],
        of: (id) => (id === diary.id ? "private" : null),
      },
    });
    expect(paths(plan)).toEqual(["Plans.md", "Private 1.md", "Private/Diary.md"]);
  });

  test("links to an attachment by id point at its file", () => {
    const top = doc("Top");
    const nested = doc("Nested", { parentId: top.id });
    const a = {
      id: "01900000-0000-0000-0000-000000000142",
      workspaceId: WS,
      documentId: nested.id,
      filename: "my photo.png",
      contentType: "image/png",
      size: 1,
      sha256: "b".repeat(64),
      createdAt: "2026-11-15T00:00:00.000Z",
      updatedAt: "2026-11-15T00:00:00.000Z",
      deletedAt: null,
    };
    const plan = planFolder({
      workspaceId: WS,
      documents: [top, nested],
      databases: [],
      attachments: [a],
    });
    const api = `https://api.lydie.co/v1/attachments/${a.id}/content?expires=1&sig=x`;
    expect(plan.attachmentLink(top.id, { kind: "image", target: `attachment:${a.id}` })).toBe(
      "attachments/my photo.png",
    );
    expect(plan.attachmentLink(nested.id, { kind: "markdown", target: api })).toBe(
      "../attachments/my photo.png",
    );
    expect(plan.attachmentLink(nested.id, { kind: "embed", target: `attachment:${a.id}` })).toBe(
      "attachments/my photo.png",
    );
    // Other links, and ids that are not exported attachments, stay as they are.
    expect(plan.attachmentLink(top.id, { kind: "markdown", target: "Nested.md" })).toBeUndefined();
    const other = `attachment:01900000-0000-0000-0000-000000000149`;
    expect(plan.attachmentLink(top.id, { kind: "image", target: other })).toBeUndefined();
  });
});
