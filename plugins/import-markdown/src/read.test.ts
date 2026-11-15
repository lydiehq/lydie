import { describe, expect, test } from "bun:test";

import { IMPORT_FILE_PREFIX } from "@lydie/plugin-api";
import type { AppApi, ImportEntry, ImportReadContext, JSONContent } from "@lydie/plugin-api";

import { planFromEntries, rewriteAttachments } from "./read.ts";

function entries(source: Record<string, string>): ImportEntry[] {
  return Object.entries(source).map(([path, content]) => ({
    path,
    size: content.length,
    read: async () => new TextEncoder().encode(content),
    text: async () => content,
  }));
}

// The host's Markdown facilities are tested in @lydie/app; frontmatter here is "key: value" lines,
// and documents have no attachments to point elsewhere.
function context(): ImportReadContext {
  const editor = {
    splitFrontmatter(markdown: string) {
      const m = /^---\n([\s\S]*?)\n---\n/.exec(markdown);
      if (!m) return { properties: null, body: markdown };
      const properties = Object.fromEntries(
        m[1]!.split("\n").map((line) => {
          const [key, ...rest] = line.split(": ");
          return [key!, rest.join(": ")];
        }),
      );
      return { properties, body: markdown.slice(m[0].length) };
    },
    fromMarkdown: (markdown: string) => ({
      content: { type: "doc", content: [] },
      source: markdown,
    }),
    toMarkdown: (original: { source: string }) => original.source,
  };
  const app = { editor } as unknown as AppApi;
  return { app, onProgress: () => {}, signal: new AbortController().signal };
}

describe("planFromEntries", () => {
  test("folders, folder notes, frontmatter and files", async () => {
    const plan = await planFromEntries(
      entries({
        "Vault/Projects.md":
          "---\nstatus: active\nid: 01973200-0000-7000-8000-000000000000\n---\n# Projects\n",
        "Vault/Projects/Lydie.md": "Writing app.\n",
        "Vault/Journal/Journal.md": "Every day.\n",
        "Vault/Journal/2026-11-15.md": "Today.\n",
        "Vault/Inbox.md": "Stuff.\n",
        "Vault/assets/photo.png": "png",
        "Vault/Tasks.base": "views: []",
      }),
      context(),
      "Markdown",
    );
    expect(plan.rootTitle).toBe("Vault");
    const titles = plan.pages.map((p) => p.title);
    expect(titles).toEqual(["Inbox", "Journal", "2026-11-15", "Projects", "Lydie"]);
    const byTitle = new Map(plan.pages.map((p) => [p.title, p]));
    expect(byTitle.get("Projects")).toMatchObject({
      parentId: null,
      markdown: "# Projects\n",
      properties: { status: "active" },
    });
    expect(byTitle.get("Lydie")!.parentId).toBe(byTitle.get("Projects")!.id);
    expect(byTitle.get("Journal")!.markdown).toBe("Every day.\n");
    expect(plan.files.map((f) => [f.name, f.contentType, f.pageId])).toEqual([
      ["photo.png", "image/png", null],
    ]);
    expect(plan.warnings.map((w) => w.message)).toEqual([
      "1 collection (.base) file was left out: their pages come in as pages, without the collection's properties and views.",
    ]);
  });

  test("no notes", async () => {
    await expect(planFromEntries(entries({ "a.png": "x" }), context(), "M")).rejects.toThrow(
      "No Markdown files",
    );
  });
});

describe("rewriteAttachments", () => {
  test("embeds and lone images of the import's files", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "embed", attrs: { target: "photo.png" } },
        { type: "embed", attrs: { target: "Other note" } },
        { type: "paragraph", content: [{ type: "image", attrs: { src: "assets/my%20cat.jpg" } }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "inline " },
            { type: "image", attrs: { src: "assets/my%20cat.jpg" } },
          ],
        },
      ],
    };
    const ids: Record<string, string> = { "photo.png": "f1", "assets/my cat.jpg": "f2" };
    expect(rewriteAttachments(doc, (target) => ids[target] ?? null)).toBe(true);
    expect(doc.content!.map((n) => n.attrs?.target ?? n.type)).toEqual([
      `${IMPORT_FILE_PREFIX}f1`,
      "Other note",
      `${IMPORT_FILE_PREFIX}f2`,
      "paragraph",
    ]);
  });
});
