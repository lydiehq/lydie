// A small Notion HTML export, written as the export lays it out: a page with a sub-page and an
// inline database, a full-page database whose rows relate to the inline one, files and links.
import { describe, expect, test } from "bun:test";

import type { AppApi } from "@lydie/plugin-api";
import { IMPORT_FILE_PREFIX } from "@lydie/plugin-api/import";
import type { ImportEntry, ImportPage, ImportReadContext } from "@lydie/plugin-api/import";

import { MARKDOWN_EXPORT, planFromEntries } from "./read.ts";

const ID = {
  home: "11111111111111111111111111111111",
  plan: "22222222222222222222222222222222",
  tasks: "33333333333333333333333333333333",
  write: "44444444444444444444444444444444",
  ship: "55555555555555555555555555555555",
  projects: "66666666666666666666666666666666",
  lydie: "77777777777777777777777777777777",
};

const enc = (path: string) => path.split("/").map(encodeURIComponent).join("/");

function page(title: string, body: string, extra = "") {
  return `<html><head><meta charset="utf-8"/><title>${title}</title></head><body><article id="x" class="page sans"><header><div class="page-header-icon undefined"><span class="icon">🏠</span></div><h1 class="page-title">${title}</h1><p class="page-description"></p>${extra}</header>${body}</article></body></html>`;
}

const prop = (type: string, name: string, cell: string) =>
  `<tr class="property-row property-row-${type}"><th><span class="icon property-icon"></span>${name}</th><td>${cell}</td></tr>`;

const HOME = `Home ${ID.home}`;
const TASKS_DIR = `${HOME}/Tasks ${ID.tasks}`;
const PROJECTS = `Projects ${ID.projects}`;

const files: Record<string, string> = {
  [`${HOME}.html`]: page(
    "Home",
    `<div class="page-body"><p>See <a href="${enc(`${HOME}/Plan ${ID.plan}.html`)}">the plan</a>.</p><figure class="image"><a href="${enc(`${HOME}/cat.jpg`)}"><img src="${enc(`${HOME}/cat.jpg`)}"/></a></figure><div class="collection-content"><h4 class="collection-title">Tasks</h4><table class="collection-content"><thead><tr><th><span class="icon property-icon"><svg class="typesTitle"></svg></span>Task</th><th><span class="icon property-icon"><svg class="typesStatus"></svg></span>Status</th><th><span class="icon property-icon"><svg class="typesNumber"></svg></span>Points</th></tr></thead><tbody><tr><td class="cell-title"><a href="${enc(`${TASKS_DIR}/Ship ${ID.ship}.html`)}">Ship</a></td></tr><tr><td class="cell-title"><a href="${enc(`${TASKS_DIR}/Write ${ID.write}.html`)}">Write</a></td></tr></tbody></table></div><figure class="link-to-page"><a href="${enc(`${HOME}/Plan ${ID.plan}.html`)}">Plan</a></figure></div>`,
  ),
  [`${HOME}/Plan ${ID.plan}.html`]: page("Plan", '<div class="page-body"><p>The plan.</p></div>'),
  [`${HOME}/cat.jpg`]: "jpg",
  [`${TASKS_DIR}/Write ${ID.write}.html`]: page(
    "Write",
    '<div class="page-body"><p>Draft first.</p></div>',
    `<table class="properties"><tbody>${prop("status", "Status", '<span class="status-value select-value-color-green">Done</span>')}${prop("relation", "Project", `<a href="${enc(`../../${PROJECTS}/Lydie ${ID.lydie}.html`)}">Lydie</a>`)}${prop("date", "Due", "<time>@November 12, 2026 3:00 PM</time>")}${prop("formula", "Score", "42")}${prop("file", "Spec", `<a href="${enc("spec.pdf")}">spec.pdf</a>`)}</tbody></table>`,
  ),
  [`${TASKS_DIR}/spec.pdf`]: "pdf",
  [`${TASKS_DIR}/Ship ${ID.ship}.html`]: page(
    "Ship",
    '<div class="page-body"></div>',
    `<table class="properties"><tbody>${prop("status", "Status", '<span class="status-value select-value-color-gray">Not started</span>')}${prop("formula", "Score", "7")}</tbody></table>`,
  ),
  [`${PROJECTS}.html`]: page(
    "Projects",
    `<table class="collection-content"><thead><tr><th><span class="icon property-icon"><svg class="typesTitle"></svg></span>Name</th><th><span class="icon property-icon"><svg class="typesMultipleSelect"></svg></span>Tags</th></tr></thead><tbody><tr><td class="cell-title"><a href="${enc(`${PROJECTS}/Lydie ${ID.lydie}.html`)}">Lydie</a></td></tr></tbody></table>`,
  ),
  [`${PROJECTS}/Lydie ${ID.lydie}.html`]: page(
    "Lydie",
    '<div class="page-body"><p>A project.</p></div>',
    `<table class="properties"><tbody>${prop("multi_select", "Tags", '<span class="selected-value select-value-color-blue">app</span><span class="selected-value select-value-color-red">writing</span>')}</tbody></table>`,
  ),
  [`${PROJECTS}.csv`]: "Name,Tags",
  "index.html": "<html></html>",
};

function entries(source: Record<string, string>): ImportEntry[] {
  return Object.entries(source).map(([path, content]) => ({
    path,
    size: content.length,
    read: async () => new TextEncoder().encode(content),
    text: async () => content,
  }));
}

function context(): ImportReadContext {
  // The editor's conversion is the host's (tested in @lydie/app); here the prepared HTML shows.
  const app = { editor: { fromHtml: (html: string) => html } } as unknown as AppApi;
  return { app, onProgress: () => {}, signal: new AbortController().signal };
}

describe("planFromEntries", () => {
  test("pages, collections, values, files and links", async () => {
    const plan = await planFromEntries(entries(files), context());
    const byTitle = new Map(plan.pages.map((p) => [p.title, p]));
    const get = (title: string) => byTitle.get(title) as ImportPage;

    // Parents first; siblings in the order their parent shows them.
    expect(plan.pages.map((p) => p.title)).toEqual([
      "Home",
      "Tasks",
      "Ship",
      "Write",
      "Plan",
      "Projects",
      "Lydie",
    ]);
    expect(get("Home").parentId).toBeNull();
    expect(get("Tasks").parentId).toBe(get("Home").id);
    expect(get("Write").parentId).toBe(get("Tasks").id);
    expect(get("Home").properties).toEqual({ icon: "🏠" });

    const home = get("Home").markdown;
    expect(home).toContain(`data-target="lydie-import:${get("Plan").id}"`);
    expect(home).toContain(`data-target="lydie-import:${get("Tasks").id}.base"`);
    const cat = plan.files.find((f) => f.name === "cat.jpg")!;
    expect(cat).toMatchObject({ contentType: "image/jpeg", pageId: get("Home").id });
    expect(home).toContain(`data-target="${IMPORT_FILE_PREFIX}${cat.id}"`);

    // The inline database: its columns from the table on Home, types from its rows.
    const tasks = get("Tasks").database!;
    expect(tasks.titleName).toBe("Task");
    const props = new Map(tasks.properties.map((p) => [p.name, p]));
    expect([...props.keys()]).toEqual(["Status", "Points", "Project", "Due", "Score", "Spec"]);
    expect(props.get("Status")).toMatchObject({ type: "status" });
    expect(props.get("Status")!.config!.options).toEqual([
      { name: "Not started", color: "gray", group: "todo" },
      { name: "Done", color: "green", group: "complete" },
    ]);
    expect(props.get("Points")!.type).toBe("number");
    expect(props.get("Project")!.type).toBe("relation");
    expect(props.get("Project")!.config!.relation!.databaseId).toBe(get("Projects").id);
    expect(props.get("Due")).toMatchObject({ type: "date", config: { includeTime: true } });
    expect(props.get("Score")!.type).toBe("number");
    expect(props.get("Spec")!.type).toBe("files");

    const spec = plan.files.find((f) => f.name === "spec.pdf")!;
    const value = (row: string, name: string) => get(row).values?.[props.get(name)!.id];
    expect(value("Write", "Status")).toBe("Done");
    expect(value("Write", "Project")).toEqual([get("Lydie").id]);
    expect(value("Write", "Due")).toBe("2026-11-12T15:00");
    expect(value("Write", "Score")).toBe(42);
    expect(value("Write", "Spec")).toEqual([`${IMPORT_FILE_PREFIX}${spec.id}`]);
    expect(spec.pageId).toBe(get("Write").id);
    expect(value("Ship", "Status")).toBe("Not started");
    expect(value("Ship", "Points")).toBeUndefined();

    const projects = get("Projects").database!;
    expect(projects.titleName).toBe("Name");
    expect(projects.properties.map((p) => [p.name, p.type])).toEqual([["Tags", "multiSelect"]]);
    expect(get("Lydie").values?.[projects.properties[0]!.id]).toEqual(["app", "writing"]);

    expect(plan.warnings).toEqual([
      {
        source: "Tasks",
        message:
          "“Score” is a formula in Notion. Its results were imported as values; the formula itself was not.",
      },
    ]);
    // Databases' CSV copies and the export's index are not files to upload.
    expect(plan.files.map((f) => f.name).sort()).toEqual(["cat.jpg", "spec.pdf"]);
  });

  test("a Markdown & CSV export asks for HTML", async () => {
    const markdown = entries({ [`Home ${ID.home}.md`]: "# Home", [`Tasks ${ID.tasks}.csv`]: "" });
    await expect(planFromEntries(markdown, context())).rejects.toThrow(MARKDOWN_EXPORT);
  });

  test("a single teamspace folder is not a page of its own", async () => {
    const nested = Object.fromEntries(
      Object.entries(files).map(([path, content]) => [`Private & Shared/${path}`, content]),
    );
    const plan = await planFromEntries(entries(nested), context());
    expect(plan.pages.find((p) => p.title === "Private & Shared")).toBeUndefined();
    expect(plan.pages.filter((p) => p.parentId === null).map((p) => p.title)).toEqual([
      "Home",
      "Projects",
    ]);
  });
});
