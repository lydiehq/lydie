// Collections (databases in the code) in a real browser: create one, add properties and pages,
// edit cells from the keyboard, filter (chips) / sort / group, personal view changes and "Save for
// everyone", switch views, drag on the board, move on the calendar, inline embeds and "View of a
// collection…", turning a page into a collection and back, the properties panel, undo/redo across
// all of it, and reload. Elements are found by role, label or test id. Run:
// `bun run test:e2e:databases` (builds `.e2e/databases` first).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { BrowserContext, Locator, Page } from "playwright";

import { startDatabasesServer } from "./databases-server.ts";
import type { Server } from "./databases-server.ts";
import { browserType, MOD, until, watchErrors } from "./helpers.ts";

let server: Server;
let context: BrowserContext;
let page: Page;
let errors: string[];

beforeAll(async () => {
  server = await startDatabasesServer();
});

afterAll(async () => {
  await server?.stop();
});

beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), "lydie-db-e2e-"));
  context = await browserType().launchPersistentContext(dir, {
    viewport: { width: 1400, height: 900 },
  });
  context.on("close", () => rmSync(dir, { recursive: true, force: true }));
  page = await context.newPage();
  errors = watchErrors(page);
  await page.goto(server.url);
  await page.getByTestId("app-shell").waitFor({ timeout: 30_000 });
});

afterEach(async () => {
  await context?.close();
  expect(errors).toEqual([]);
});

// ---- Helpers

const focused = () => page.locator("[data-testid=tab-view][data-focused]");
const database = () => focused().getByTestId("database");
const grid = () => database().getByRole("grid", { name: "Table" });
const rowNamed = (title: string) =>
  grid().locator("[role=row][data-row-id]").filter({ hasText: title });
const cell = (title: string, col: number) =>
  rowNamed(title).locator(`[data-cell][data-c="${col}"]`);

async function blur() {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

async function undo() {
  await blur();
  await page.keyboard.press(`${MOD}+z`);
}

async function redo() {
  await blur();
  await page.keyboard.press(`${MOD}+Shift+z`);
}

async function newPage(title: string) {
  await page
    .getByRole("button", { name: /^New document/ })
    .first()
    .click();
  const field = focused().getByLabel("Title");
  await field.waitFor();
  await until(
    async () => await field.evaluate((el) => el === document.activeElement),
    3000,
    "title focus",
  );
  await field.pressSequentially(title, { delay: 5 });
  await page.keyboard.press("Enter");
  await until(
    async () =>
      await focused()
        .locator("[data-doc-content]")
        .evaluate((el) => el.contains(document.activeElement)),
    3000,
    "editor focus",
  );
}

async function slash(item: RegExp) {
  await page.keyboard.type("/collection", { delay: 10 });
  await page.getByRole("option", { name: item }).click();
}

async function addProperty(name: string, type: string) {
  await grid().getByRole("button", { name: "Add a property" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a property" });
  await dialog.getByLabel("Property name").fill(name);
  // Picking a type adds the property (`type` may carry its glyph: "# Number").
  await dialog.getByRole("button", { name: type.replace(/^\S+ /, ""), exact: true }).click();
  await grid().getByRole("columnheader").filter({ hasText: name }).waitFor();
}

// Escape closes the topmost popover (focus may have left it when its content changed).
async function closePopover() {
  // A select's list inside the popover has to finish closing first, or it is what Escape closes.
  await until(async () => (await page.getByRole("listbox").count()) === 0, 3000, "list closed");
  const dialogs = page.getByRole("dialog");
  const count = await dialogs.count();
  if (count === 0) return;
  await dialogs.last().focus();
  await page.keyboard.press("Escape");
  await until(async () => (await dialogs.count()) < count, 3000, "popover closed");
}

// The editor closed and the grid has the keyboard again.
async function editorClosed() {
  await until(
    async () => (await page.getByRole("dialog", { name: /^Edit / }).count()) === 0,
    3000,
    "editor closed",
  );
  await until(
    async () => await page.evaluate(() => document.activeElement?.getAttribute("role") === "grid"),
    3000,
    "grid focus",
  );
}

async function addRow(title: string) {
  await grid().getByRole("button", { name: "New", exact: true }).last().click();
  const editor = page.getByRole("dialog", { name: /^Edit / }).getByRole("textbox");
  await editor.waitFor();
  await editor.fill(title);
  await page.keyboard.press("Enter");
  await rowNamed(title).waitFor();
}

// A collection under a new page, shown there, then opened as a page.
async function createDatabase(): Promise<string> {
  await newPage("Project home");
  await slash(/^Collection/);
  const inline = focused().getByTestId("inline-database");
  await inline.getByTestId("database").waitFor();
  await inline.getByRole("button", { name: /^Open as page/ }).click();
  await until(
    async () => (await focused().getByTestId("inline-database").count()) === 0,
    3000,
    "collection opened as a page",
  );
  await database().waitFor();
  return (await database().getAttribute("data-database-id"))!;
}

// The saved view as everyone sees it (personal changes are not in it).
async function savedView(databaseId: string, index = 0) {
  return api<{ id: string; config: { filter: unknown; sorts: unknown[] } }>(
    `async (host, { id, index }) => (await host.backend.query("database.get", { id }))[0].views[index]`,
    { id: databaseId, index },
  );
}

// Adds "property > value" through the chips: the menu, then the new chip's parts.
async function addNumberFilter(property: string, op: string, value: string) {
  await database().getByRole("button", { name: "Filter", exact: true }).click();
  await page
    .getByTestId("filter-menu")
    .getByRole("button", { name: new RegExp(property) })
    .click();
  // The new filter's value opens at once; set the condition first.
  await page.getByTestId("filter-value").waitFor();
  await closePopover();
  const chip = database().getByTestId("filter-chip").last();
  await chip.getByRole("button", { name: /^Filter condition/ }).click();
  await page
    .getByRole("dialog", { name: /^Filter condition/ })
    .getByRole("button", { name: op, exact: true })
    .click();
  await chip.getByRole("button", { name: /^Filter value/ }).click();
  await page.getByTestId("filter-value").getByLabel("Value").fill(value);
  await closePopover();
}

async function api<T>(fn: string, arg?: unknown): Promise<T> {
  return page.evaluate(
    // oxlint-disable-next-line typescript/no-implied-eval -- test-only code
    ({ fn, arg }) =>
      new Function("host", "arg", `return (${fn})(host, arg)`)((window as any).__lydie.host, arg),
    { fn, arg },
  ) as Promise<T>;
}

async function value(databaseId: string, title: string, key: string): Promise<unknown> {
  return api(
    `async (host, { databaseId, title, key }) => {
      const items = await host.backend.query("database.view", {
        databaseId,
        view: { config: { filter: null, groupBy: null } },
        window: { limit: 1000 },
      });
      const row = items.find((i) => i.kind === "row" && i.row.title === title);
      return row ? row.row.properties[key] ?? null : undefined;
    }`,
    { databaseId, title, key },
  );
}

async function texts(locator: Locator) {
  return (await locator.allTextContents()).map((t) => t.trim());
}

// ---- Tests

describe("database table", () => {
  test("create, add properties and rows, edit cells by keyboard, paste, delete, undo/redo, reload", async () => {
    const id = await createDatabase();
    await addProperty("Points", "# Number");
    await addProperty("Status", "◉ Select");
    for (const title of ["Alpha", "Beta", "Gamma"]) await addRow(title);
    await page.screenshot({ path: "/tmp/lydie-databases-e2e-table.png" });

    // Select Alpha's Points cell, type to edit, Enter commits.
    await cell("Alpha", 1).click();
    await page.keyboard.type("5");
    // Keys right after Enter, without waiting for focus to settle, still reach the grid (LYD-257).
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.type("8");
    await page.keyboard.press("Tab");
    await editorClosed();
    // Tab moved right to Beta's Status: Enter opens the option list, typing creates "Todo".
    await until(
      async () => (await cell("Beta", 2).getAttribute("aria-selected")) === "true",
      3000,
      "Tab moved",
    );
    await page.keyboard.press("Enter");
    await page.getByRole("combobox", { name: "Status" }).fill("Todo");
    await page.keyboard.press("Enter");
    await until(
      async () => (await cell("Beta", 2).textContent())?.trim() === "Todo",
      3000,
      "Beta Todo",
    );
    expect(await value(id, "Beta", "Points")).toBe(8);

    // Copy Alpha's points and paste into Gamma (TSV clipboard events on the grid).
    // A plain click edits a cell; Cmd/Ctrl+click only selects it.
    await cell("Alpha", 1).click({ modifiers: ["ControlOrMeta"] });
    const copied = await grid().evaluate((el) => {
      const data = new DataTransfer();
      el.dispatchEvent(
        new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }),
      );
      return data.getData("text/plain");
    });
    expect(copied).toBe("5");
    await cell("Gamma", 1).click({ modifiers: ["ControlOrMeta"] });
    await grid().evaluate((el, text) => {
      const data = new DataTransfer();
      data.setData("text/plain", text);
      el.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
      );
    }, "5\tTodo");
    await until(async () => (await value(id, "Gamma", "Status")) === "Todo", 3000, "paste");
    expect(await value(id, "Gamma", "Points")).toBe(5);
    // The paste was one step.
    await undo();
    await until(async () => (await value(id, "Gamma", "Points")) === null, 3000, "undo paste");
    expect(await value(id, "Gamma", "Status")).toBeNull();
    await redo();
    await until(async () => (await value(id, "Gamma", "Points")) === 5, 3000, "redo paste");

    // Delete clears the selected cells; undo restores.
    await cell("Alpha", 1).click({ modifiers: ["ControlOrMeta"] });
    await page.keyboard.press("Delete");
    await until(async () => (await value(id, "Alpha", "Points")) === null, 3000, "cleared");
    await undo();
    await until(async () => (await value(id, "Alpha", "Points")) === 5, 3000, "restored");

    // Select two rows and delete them in one step.
    await rowNamed("Alpha").getByRole("checkbox").click({ force: true });
    await rowNamed("Beta").getByRole("checkbox").click({ force: true });
    await expect(page.getByTestId("selected-count").textContent()).resolves.toBe("2 selected");
    await page
      .getByRole("toolbar", { name: "Selected rows" })
      .getByRole("button", { name: "Delete" })
      .click();
    await until(
      async () => (await rowNamed("Alpha").count()) === 0 && (await rowNamed("Beta").count()) === 0,
      3000,
      "deleted",
    );
    await undo();
    await rowNamed("Alpha").waitFor();
    await rowNamed("Beta").waitFor();

    // Reload: everything is still there.
    await page.reload();
    await page.getByTestId("app-shell").waitFor();
    await database().waitFor();
    await rowNamed("Gamma").waitFor();
    const headers = (await texts(grid().getByRole("columnheader"))).join("|");
    expect(headers).toContain("Points");
    expect(headers).toContain("Status");
    expect(await value(id, "Beta", "Points")).toBe(8);
  });
});

describe("views", () => {
  test("filter, sort, group, board drag, calendar move, undo/redo, persisted", async () => {
    const id = await createDatabase();
    await addProperty("Points", "# Number");
    await addProperty("Status", "◉ Select");
    await addProperty("Due", "▦ Date");
    for (const title of ["Alpha", "Beta", "Gamma"]) await addRow(title);
    const props = await api<Record<string, string>>(
      `async (host, id) => Object.fromEntries((await host.backend.query("database.get", { id }))[0].properties.map((p) => [p.name, p.id]))`,
      id,
    );
    const today = await page.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
    const rowIds = await api<Record<string, string>>(
      `async (host, id) => Object.fromEntries((await host.backend.query("database.view", { databaseId: id })).filter((i) => i.kind === "row").map((i) => [i.row.title, i.row.id]))`,
      id,
    );
    await api(
      `(host, { id, props, rowIds, today }) => host.backend.ops.database.setValues({ databaseId: id, updates: [
        { rowId: rowIds.Alpha, set: { [props.Points]: 3, [props.Status]: "Todo", [props.Due]: today } },
        { rowId: rowIds.Beta, set: { [props.Points]: 9, [props.Status]: "Done", [props.Due]: today } },
        { rowId: rowIds.Gamma, set: { [props.Points]: 6 } },
      ] })`,
      { id, props, rowIds, today },
    );
    await until(async () => (await cell("Beta", 1).textContent())?.trim() === "9", 3000, "values");

    // Filter: Points > 5, as a chip that reads as a sentence.
    await addNumberFilter("Points", ">", "5");
    await until(async () => (await rowNamed("Alpha").count()) === 0, 3000, "filtered");
    expect(await texts(database().getByTestId("filter-chip"))).toEqual([
      expect.stringContaining("Points>5"),
    ]);
    await rowNamed("Beta").waitFor();
    await rowNamed("Gamma").waitFor();
    await page.screenshot({ path: "/tmp/lydie-databases-e2e-filter.png" });

    // Sort by Points descending.
    await database().getByRole("button", { name: "Display", exact: true }).click();
    await page.getByTestId("sort-menu").getByRole("button", { name: "+ Add sort" }).click();
    const sortMenu = page.getByTestId("sort-menu");
    await sortMenu.getByRole("button", { name: /Sort by/ }).click();
    await page.getByRole("option", { name: "Points", exact: true }).click();
    await sortMenu.getByRole("button", { name: /Direction/ }).click();
    await page.getByRole("option", { name: "Descending", exact: true }).click();
    await closePopover();
    await until(
      async () =>
        (await texts(grid().locator("[role=row][data-row-id] [data-row-title]"))).join(",") ===
        "Beta,Gamma",
      3000,
      "sorted",
    );

    // The sorted column shows it in its header.
    const sorted = () => grid().locator('[role=columnheader][aria-sort="descending"]');
    await sorted().filter({ hasText: "Points" }).waitFor();

    // Remove the sort again (in Display); the order is manual.
    await database().getByRole("button", { name: "Display", exact: true }).click();
    await page.getByTestId("sort-menu").getByRole("button", { name: "Remove sort" }).click();
    await closePopover();
    await until(async () => (await sorted().count()) === 0, 3000, "sort removed");

    // Group by Status.
    await database().getByRole("button", { name: "Display", exact: true }).click();
    await page
      .getByTestId("group-menu")
      .getByRole("button", { name: /Group by/ })
      .click();
    await page.getByRole("option", { name: "Status", exact: true }).click();
    await closePopover();
    await grid().locator("[data-group]").first().waitFor();
    expect((await texts(grid().locator("[data-group]"))).some((t) => t.includes("Done"))).toBe(
      true,
    );

    // A board view, columns by Status; drag Gamma (no status) to Todo.
    await database().getByRole("button", { name: "Add a view" }).click();
    await page
      .getByRole("dialog", { name: "Add a view" })
      .getByRole("button", { name: "Board" })
      .click();
    await until(async () => (await page.getByRole("dialog").count()) === 0, 3000, "menu closed");
    const board = database().getByTestId("board-view");
    await board.waitFor();
    const todo = board.getByRole("group", { name: "Todo column" });
    const none = board.getByRole("group", { name: "No Status column" });
    await none.locator("[data-card]").filter({ hasText: "Gamma" }).waitFor();
    await page.screenshot({ path: "/tmp/lydie-databases-e2e-board.png" });
    await none.locator("[data-card]").filter({ hasText: "Gamma" }).dragTo(todo);
    await todo.locator("[data-card]").filter({ hasText: "Gamma" }).waitFor();
    await until(
      async () => (await value(id, "Gamma", "Status")) === "Todo",
      3000,
      "moved on board",
    );
    await undo();
    await until(
      async () => (await value(id, "Gamma", "Status")) === null,
      3000,
      "board move undone",
    );
    await none.locator("[data-card]").filter({ hasText: "Gamma" }).waitFor();
    await redo();
    await until(
      async () => (await value(id, "Gamma", "Status")) === "Todo",
      3000,
      "board move redone",
    );

    // A calendar view: drag Alpha from today to tomorrow-ish (another day in the grid).
    await database().getByRole("button", { name: "Add a view" }).click();
    await page
      .getByRole("dialog", { name: "Add a view" })
      .getByRole("button", { name: "Calendar" })
      .click();
    await until(async () => (await page.getByRole("dialog").count()) === 0, 3000, "menu closed");
    const calendar = database().getByTestId("calendar-view");
    await calendar.waitFor();
    const todayCell = calendar.locator(`[data-day="${today}"]`);
    await todayCell.locator("[data-event]").filter({ hasText: "Alpha" }).waitFor();
    const target = await page.evaluate((day) => {
      const d = new Date(`${day}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + (d.getUTCDay() === 0 ? -1 : 1));
      return d.toISOString().slice(0, 10);
    }, today);
    await page.screenshot({ path: "/tmp/lydie-databases-e2e-calendar.png" });
    await todayCell
      .locator("[data-event]")
      .filter({ hasText: "Alpha" })
      .dragTo(calendar.locator(`[data-day="${target}"]`));
    await until(async () => (await value(id, "Alpha", "Due")) === target, 3000, "calendar move");
    await undo();
    await until(
      async () => (await value(id, "Alpha", "Due")) === today,
      3000,
      "calendar move undone",
    );

    // The views persist.
    await page.reload();
    await page.getByTestId("app-shell").waitFor();
    await database().waitFor();
    expect(await texts(database().getByRole("tab"))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Board"),
        expect.stringContaining("Calendar"),
      ]),
    );
  });
});

describe("personal view changes", () => {
  test("filters are personal until saved: Edited, Reset, Save for everyone as one undo step", async () => {
    const id = await createDatabase();
    await addProperty("Points", "# Number");
    for (const title of ["Alpha", "Beta"]) await addRow(title);
    const props = await api<Record<string, string>>(
      `async (host, id) => Object.fromEntries((await host.backend.query("database.get", { id }))[0].properties.map((p) => [p.name, p.id]))`,
      id,
    );
    const rowIds = await api<Record<string, string>>(
      `async (host, id) => Object.fromEntries((await host.backend.query("database.view", { databaseId: id })).filter((i) => i.kind === "row").map((i) => [i.row.title, i.row.id]))`,
      id,
    );
    await api(
      `(host, { id, props, rowIds }) => host.backend.ops.database.setValues({ databaseId: id, updates: [
        { rowId: rowIds.Alpha, set: { [props.Points]: 3 } },
        { rowId: rowIds.Beta, set: { [props.Points]: 9 } },
      ] })`,
      { id, props, rowIds },
    );
    const edited = () => database().getByTestId("view-edited");

    // `F` opens "add filter" when the view has focus.
    await database().focus();
    await page.keyboard.press("f");
    await page.getByTestId("filter-menu").waitFor();
    await closePopover();

    // A filter changes what this device shows, not the saved view.
    await addNumberFilter("Points", ">", "5");
    await until(async () => (await rowNamed("Alpha").count()) === 0, 3000, "filtered");
    await edited().waitFor();
    expect((await savedView(id)).config.filter).toBeNull();

    // It survives a reload (kept on this device).
    await page.waitForTimeout(300);
    await page.reload();
    await page.getByTestId("app-shell").waitFor();
    await database().waitFor();
    await edited().waitFor();
    await rowNamed("Beta").waitFor();
    expect(await rowNamed("Alpha").count()).toBe(0);

    // Reset drops it.
    await edited().getByRole("button", { name: "Reset" }).click();
    await rowNamed("Alpha").waitFor();
    expect(await edited().count()).toBe(0);
    expect(await database().getByTestId("filter-chip").count()).toBe(0);

    // Save for everyone: one operation on the saved view, then nothing is "Edited".
    await addNumberFilter("Points", ">", "5");
    await edited().getByRole("button", { name: "Save for everyone" }).click();
    await until(async () => (await savedView(id)).config.filter !== null, 3000, "saved");
    await until(async () => (await edited().count()) === 0, 3000, "no longer edited");
    await until(async () => (await rowNamed("Alpha").count()) === 0, 3000, "still filtered");
    // One undo step brings the saved view back.
    await undo();
    await until(async () => (await savedView(id)).config.filter === null, 3000, "save undone");
    await rowNamed("Alpha").waitFor();

    // Sorting is personal too.
    await database().getByRole("button", { name: "Display", exact: true }).click();
    await page.getByTestId("sort-menu").getByRole("button", { name: "+ Add sort" }).click();
    await closePopover();
    await grid().locator("[role=columnheader][aria-sort]").waitFor();
    await edited().waitFor();
    expect((await savedView(id)).config.sorts).toEqual([]);
  });
});

describe("one way in", () => {
  test("New collection, View of a collection… and Collection; open as page", async () => {
    // The palette's "New collection": a top-level collection, opened.
    await api(`(host) => host.app.runCommand("databases.new")`);
    await database().waitFor();
    const first = (await database().getAttribute("data-database-id"))!;

    // "View of a collection…" shows an existing one here, picked by name.
    await newPage("Hub");
    await slash(/^View of a collection/);
    const picker = page.getByRole("dialog", { name: "Show a collection here" });
    await picker.waitFor();
    await picker.getByRole("option", { name: "Untitled collection", exact: true }).click();
    const shown = focused().getByTestId("inline-database").getByTestId("database");
    await shown.waitFor();
    expect(await shown.getAttribute("data-database-id")).toBe(first);

    // "Collection" makes a new one under this page and shows it here.
    await newPage("Notes");
    await slash(/^Collection/);
    const inline = focused().getByTestId("inline-database");
    await inline.getByTestId("database").waitFor();
    const second = await inline.getByTestId("database").getAttribute("data-database-id");
    expect(second).not.toBe(first);
    const parentId = await api<string | null>(
      `async (host, id) => (await host.backend.query("doc.get", { id }))[0].document.parentId`,
      second,
    );
    expect(parentId).toBe(await api<string>(`(host) => host.app.activeTab().path.slice(3)`));

    // Open as page: the collection's own page, with room for a description.
    await inline.getByRole("button", { name: /^Open as page/ }).click();
    await until(
      async () => (await database().getAttribute("data-database-id")) === second,
      3000,
      "opened as a page",
    );
    await focused().getByRole("button", { name: "Add a description…" }).waitFor();
  });

  test("turn a page with sub-pages into a collection and back; its text stays", async () => {
    await newPage("Reading list");
    await page.keyboard.type("Books to read this year", { delay: 5 });
    const docId = await api<string>(`(host) => host.app.activeTab().path.slice(3)`);
    await api(
      `(host, parentId) => host.backend.ops.doc.create({ workspaceId: host.backend.info.workspaceId, parentId, title: "Dune" })`,
      docId,
    );
    await page.waitForTimeout(600);
    // The command other plugins run with the document id.
    await api(`(host, id) => host.app.runCommand("databases.fromPage", id)`, docId);
    await database().waitFor();
    await rowNamed("Dune").waitFor();
    await focused()
      .getByTestId("collection-description")
      .getByText("Books to read this year")
      .waitFor();

    await api(`(host) => host.app.runCommand("databases.toPage")`);
    await until(async () => (await database().count()) === 0, 3000, "a page again");
    await focused().locator("[data-doc-content]").getByText("Books to read this year").waitFor();
    // Undo turns it into a collection again.
    await undo();
    await database().waitFor();
  });
});

describe("inline collections and properties", () => {
  test("an inline collection lives in the page; undo inside it", async () => {
    await newPage("Notes with a table");
    await slash(/^Collection/);
    const inline = focused().getByTestId("inline-database");
    await inline.waitFor();
    await inline.getByRole("grid", { name: "Table" }).waitFor();
    await inline
      .getByRole("grid", { name: "Table" })
      .getByRole("button", { name: "New", exact: true })
      .click();
    const editor = page.getByRole("dialog", { name: /^Edit / }).getByRole("textbox");
    await editor.fill("Inline row");
    await page.keyboard.press("Enter");
    await inline.locator("[role=row][data-row-id]").filter({ hasText: "Inline row" }).waitFor();
    await page.screenshot({ path: "/tmp/lydie-databases-e2e-inline.png" });
    // Focus is back on the grid: Cmd+Z undoes the rename, then the new row.
    await page.keyboard.press(`${MOD}+z`);
    await inline.locator("[role=row][data-row-id]").filter({ hasText: "Untitled" }).waitFor();
    await page.keyboard.press(`${MOD}+z`);
    await until(
      async () => (await inline.locator("[role=row][data-row-id]").count()) === 0,
      3000,
      "row undone",
    );
    // The embed survives a reload (it is Markdown: ![[Untitled collection.base]]).
    await page.waitForTimeout(600);
    await page.reload();
    await page.getByTestId("app-shell").waitFor();
    await focused().getByTestId("inline-database").waitFor();
  });

  test("properties panel: a page's frontmatter and a row's schema", async () => {
    // A vault page with frontmatter under a plain parent page that has another sub-page.
    const ids = await api<{ trips: string; lisbon: string }>(
      `async (host) => {
        const ops = host.backend.ops;
        const workspaceId = host.app.workspace.workspaceId;
        const trips = await ops.doc.create({ workspaceId, title: "Trips" });
        const lisbon = await ops.doc.create({ workspaceId, title: "Lisbon", parentId: trips.id });
        const porto = await ops.doc.create({ workspaceId, title: "Porto", parentId: trips.id });
        await ops.doc.setProperties({ id: lisbon.id, set: { Points: 3, Mood: "sunny" } });
        await ops.doc.setProperties({ id: porto.id, set: { Points: 5 } });
        host.app.openDoc(lisbon.id);
        return { trips: trips.id, lisbon: lisbon.id };
      }`,
    );
    const panel = focused().getByTestId("properties");
    // Existing frontmatter stays editable on a page outside a collection.
    await panel.getByRole("button", { name: "Edit Points" }).click();
    await page.getByRole("dialog", { name: "Edit Points" }).getByRole("textbox").fill("4");
    await page.keyboard.press("Enter");
    await panel.getByText("4", { exact: true }).waitFor();
    // No free add: "Add property" explains collections and offers to make the parent one.
    await panel.getByRole("button", { name: "Add property" }).click();
    const prompt = page.getByRole("dialog", { name: "Add property" });
    await prompt.getByText("Properties are shared by the pages of a collection.").waitFor();
    await prompt
      .getByText("Trips will show its 2 sub-pages as a collection. Its text stays.")
      .waitFor();
    await prompt.getByLabel("Property name").fill("Due");
    await prompt.getByRole("button", { name: "Date", exact: true }).click();
    await prompt.getByRole("button", { name: "Make Trips a collection" }).click();
    // The page's keys became the collection's (same keys: Porto's value shows as it was).
    await panel.getByRole("button", { name: "Due settings" }).waitFor();
    await panel.getByRole("button", { name: "Mood settings" }).waitFor();
    expect(await panel.getByRole("region", { name: /^Not in / }).count()).toBe(0);
    expect(await value(ids.trips, "Porto", "Points")).toBe(5);
    await page.screenshot({ path: "/tmp/lydie-databases-e2e-properties.png" });
    // One undo step.
    await undo();
    await until(
      async () => (await panel.getByRole("button", { name: "Due settings" }).count()) === 0,
      3000,
      "collection undone",
    );
    await panel.getByRole("button", { name: "Mood settings" }).waitFor();
    await redo();
    await panel.getByRole("button", { name: "Due settings" }).waitFor();

    // A key the collection does not list shows under "Not in Trips", one click from joining it.
    await api(
      `async (host, id) => { await host.backend.ops.doc.setProperties({ id, set: { Rating: 4 } }); }`,
      ids.lisbon,
    );
    const stray = panel.getByRole("region", { name: "Not in Trips" });
    await stray.getByRole("button", { name: "Rating settings" }).waitFor();
    await stray.getByRole("button", { name: "Add Rating to collection" }).click();
    await until(async () => (await stray.count()) === 0, 3000, "key added to the collection");
    await panel.getByRole("button", { name: "Rating settings" }).waitFor();

    // A row made in the table shows its collection's properties.
    await createDatabase();
    await addProperty("Points", "# Number");
    await addRow("Row page");
    await cell("Row page", 0).click({ modifiers: ["ControlOrMeta"] });
    await page.keyboard.press(`${MOD}+Enter`);
    const rowPanel = focused().getByTestId("properties");
    await rowPanel.getByRole("button", { name: "Edit Points" }).click();
    await page.getByRole("dialog", { name: "Edit Points" }).getByRole("textbox").fill("42");
    await page.keyboard.press("Enter");
    await rowPanel.getByText("42").waitFor();
  });
});
