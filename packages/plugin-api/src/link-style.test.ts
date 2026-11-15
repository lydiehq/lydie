import { describe, expect, test } from "bun:test";

import type { Backend } from "./backend.ts";
import { linkStyleOf, linkTargetFor, markdownHref } from "./link-style.ts";

// Projects/Plan, Projects/Notes/Daily, Archive/Plan, Inbox (titles; folders are parents).
const docs: Record<string, { title: string; parentId: string | null }> = {
  projects: { title: "Projects", parentId: null },
  plan: { title: "Plan", parentId: "projects" },
  notes: { title: "Notes", parentId: "projects" },
  daily: { title: "Daily", parentId: "notes" },
  archive: { title: "Archive", parentId: null },
  oldPlan: { title: "Plan", parentId: "archive" },
  inbox: { title: "Inbox", parentId: null },
};

const backend = {
  info: { workspaceId: "ws" },
  async query(name: string, params: { id?: string; text?: string }) {
    if (name === "doc.get") {
      const doc = docs[params.id!];
      return doc ? [{ document: { id: params.id, ...doc } }] : [];
    }
    if (name === "doc.search") {
      return Object.entries(docs)
        .filter(([, d]) => d.title.toLowerCase().includes(params.text!.toLowerCase()))
        .map(([id, d]) => ({ id, title: d.title }));
    }
    return [];
  },
} as unknown as Backend;

describe("link targets per folder settings", () => {
  test("shortest: the name when unique, else the full path", async () => {
    expect(await linkTargetFor(backend, "daily", "inbox", "shortest")).toBe("Inbox");
    expect(await linkTargetFor(backend, "daily", "plan", "shortest")).toBe("Projects/Plan");
  });

  test("absolute and relative", async () => {
    expect(await linkTargetFor(backend, "daily", "plan", "absolute")).toBe("Projects/Plan");
    expect(await linkTargetFor(backend, "daily", "plan", "relative")).toBe("../Plan");
    expect(await linkTargetFor(backend, "daily", "oldPlan", "relative")).toBe("../../Archive/Plan");
    expect(await linkTargetFor(backend, "plan", "notes", "relative")).toBe("Notes");
    expect(await linkTargetFor(backend, "inbox", "daily", "relative")).toBe("Projects/Notes/Daily");
  });

  test("Markdown destinations are encoded as Obsidian writes them", () => {
    expect(markdownHref("../My note (draft)")).toBe("../My%20note%20(draft).md");
  });

  test("only folder windows have a style, read at the time", () => {
    expect(linkStyleOf({})).toBeNull();
    let current = { linkFormat: "wiki", linkPath: "shortest" };
    const app = { services: { vault: { settings: { current: () => current } } } } as never;
    expect(linkStyleOf(app)).toEqual({ format: "wiki", path: "shortest" });
    current = { linkFormat: "markdown", linkPath: "relative" };
    expect(linkStyleOf(app)).toEqual({ format: "markdown", path: "relative" });
  });
});
