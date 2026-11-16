// A real Notion HTML export (Obsidian Importer's test workspace, see test/fixtures/LICENSE), from
// its zip: Notion's zip holds a zip per part, each with an "Export-<uuid>/" folder at the top.
import { expect, test } from "bun:test";

import type { AppApi } from "@lydie/plugin-api";
import { IMPORT_FILE_PREFIX, IMPORT_LINK_PREFIX } from "@lydie/plugin-api/import";

import { readNotionExport } from "./read.ts";

test("reads Notion's own export", async () => {
  const bytes = await Bun.file(
    new URL("../test/fixtures/notion-testspace.zip", import.meta.url),
  ).arrayBuffer();
  const file = new File([bytes], "notion-testspace.zip", { type: "application/zip" });
  const app = { editor: { fromHtml: (html: string) => html } } as unknown as AppApi;
  const labels = new Set<string>();
  const plan = await readNotionExport([file], {
    app,
    signal: new AbortController().signal,
    onProgress: (p) => p.label && labels.add(p.label),
  });

  expect([...labels]).toEqual(["Opening the export", "Reading pages", "Converting pages"]);
  const titles = plan.pages.map((p) => p.title);
  expect(titles).toEqual([
    "Notion-Testspace",
    "Block Reference",
    "Formatting Tests",
    "Attachment Tests",
  ]);
  const [root, blocks, formatting, attachments] = plan.pages;
  expect(plan.pages.slice(1).every((p) => p.parentId === root!.id)).toBe(true);
  expect(root!.markdown).toContain(`${IMPORT_LINK_PREFIX}${blocks!.id}`);

  // Names as the person gave them (Notion encodes them in the zip).
  expect(plan.files.map((f) => f.name).sort()).toEqual([
    "----.jpg",
    "felis-catus.jpg",
    "kocky-jsou-nejlepsi.jpg",
    "name-with-percents-006300610074.jpg",
    "кошки-самые-лучшие.jpg",
  ]);
  for (const f of plan.files) {
    expect(f.pageId).toBe(attachments!.id);
    expect(attachments!.markdown).toContain(`${IMPORT_FILE_PREFIX}${f.id}`);
  }
  const bytesOfCat = await plan.files.find((f) => f.name === "felis-catus.jpg")!.read();
  expect([...bytesOfCat.slice(0, 2)]).toEqual([0xff, 0xd8]);

  // Block Reference: callouts, toggles, to-dos, equations and code made it into editor HTML.
  const html = blocks!.markdown;
  for (const shape of [
    'data-type="callout"',
    'data-type="taskList"',
    'data-type="math-block"',
    'class="language-python"',
    'data-fold="-"',
  ]) {
    expect(html).toContain(shape);
  }
  expect(formatting!.markdown).toContain('data-type="math-inline"');
  for (const page of plan.pages) expect(page.markdown).not.toContain("katex-html");
});
