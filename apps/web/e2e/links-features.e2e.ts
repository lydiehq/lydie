// Links and the "expected features" plugins in a real browser: link preview and menu, click modifiers,
// link editing, embeds, slash menu, quick switcher, outline, backlinks, page icons and quick
// capture. Run: `bun run test:e2e:links` (builds first).
// E2E_URL=http://127.0.0.1:<port>/ runs against a dev server instead of the build.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import type { BrowserContext, Page } from "playwright";

import {
  activeEditor,
  activeTitle,
  MOD,
  newProfile,
  openApp,
  startServer,
  tabs,
  treeItem,
  until,
  watchErrors,
} from "./helpers.ts";
import type { Server } from "./helpers.ts";

let server: Server | null = null;
let url: string;
let context: BrowserContext;
let page: Page;
let errors: string[];

beforeAll(async () => {
  if (process.env.E2E_URL) url = process.env.E2E_URL;
  else {
    server = await startServer(undefined, process.env.E2E_DIST ?? ".e2e/links");
    url = server.url;
  }
});

afterAll(async () => {
  await server?.stop();
});

beforeEach(async () => {
  context = await newProfile();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  page = await openApp(context, url);
  errors = watchErrors(page);
});

afterEach(async () => {
  await context?.close();
  expect(errors).toEqual([]);
});

async function shot(name: string) {
  await page.screenshot({ path: `/tmp/lydie-links-${name}.png` });
}

// Creates a document from the sidebar's "+" with a title and a body typed line by line.
async function note(title: string, ...lines: string[]) {
  await page
    .getByRole("button", { name: /^New document/ })
    .first()
    .click();
  const field = activeTitle(page);
  await field.waitFor();
  await until(
    async () => await field.evaluate((el) => el === document.activeElement),
    3000,
    "title",
  );
  await field.pressSequentially(title, { delay: 5 });
  await page.keyboard.press("Enter");
  await until(
    async () => await activeEditor(page).evaluate((el) => el.contains(document.activeElement)),
    3000,
    "editor focus",
  );
  for (const [i, line] of lines.entries()) {
    if (i > 0) await page.keyboard.press("Enter");
    await page.keyboard.type(line, { delay: 3 });
  }
  await treeItem(page, title).first().waitFor();
  // Let the debounced save land, so links are indexed.
  await page.waitForTimeout(700);
}

function link(name: string | RegExp) {
  return activeEditor(page).locator("a[data-type=wiki-link]").filter({ hasText: name }).first();
}

const menu = () => page.getByTestId("link-menu");
const preview = () => page.getByTestId("link-preview");

async function away() {
  await page.keyboard.press("Escape");
  await until(async () => (await menu().count()) === 0, 3000, "menu closed");
}

async function pointerAway() {
  await page.mouse.move(5, 450);
  await until(async () => (await preview().count()) === 0, 3000, "preview closed");
}

async function focusedTitle() {
  return await activeTitle(page).inputValue();
}

async function paneCount() {
  return await page.locator("[data-testid=tab-view][data-active]").count();
}

describe("link preview and menu", () => {
  test("hovering a link previews the note or its heading section; clicking shows the menu", async () => {
    await note(
      "Target",
      "Intro line.",
      "## Part two",
      "Inside part two.",
      "## Part three",
      "Later.",
    );
    await note("Source", "See [[Target]] and [[Target#Part two]] here");
    expect(await preview().count()).toBe(0);
    // Resting on a link previews it; leaving closes the preview.
    await link("Target > Part two").hover();
    await preview().waitFor();
    const text = await preview().innerText();
    expect(text).toContain("Inside part two.");
    expect(text).not.toContain("Later.");
    expect(await menu().count()).toBe(0);
    await shot("hover-heading");
    await pointerAway();
    // Clicking shows the actions, not the preview, and they stay when the pointer moves away.
    await link("Target > Part two").click();
    await menu().waitFor();
    expect(await preview().count()).toBe(0);
    expect(await menu().innerText()).not.toContain("Inside part two.");
    await shot("click-menu");
    await page.mouse.move(5, 450);
    await page.waitForTimeout(400);
    expect(await menu().count()).toBe(1);
    await away();
    // Moving out of the link closes it, and the editor keeps the keys. End from the selected link
    // goes to the end of the line instead of leaving the link selected (typing would replace it).
    await link(/^Target$/).click();
    await menu().waitFor();
    await page.keyboard.press("End");
    await until(async () => (await menu().count()) === 0, 2000, "leaving closes the menu");
    await page.keyboard.type(" more");
    await activeEditor(page).getByText("See Target and Target > Part two here more").waitFor();
    // Shift+Home from a selected link keeps it in the selection.
    await page.waitForTimeout(600);
    await link("Target > Part two").click();
    await page.keyboard.press("Shift+Home");
    expect(await page.evaluate(() => String(window.getSelection()))).toBe(
      "See Target and Target > Part two",
    );
  });

  test("click modifiers: Mod same tab, Mod+Shift new tab, Mod+Alt split, back works", async () => {
    await note("Alpha", "Alpha body");
    await note("Beta", "Go to [[Alpha]] now");
    await link("Alpha").click({ modifiers: [MOD] });
    await until(async () => (await focusedTitle()) === "Alpha", 3000, "followed in place");
    expect(await tabs(page).count()).toBe(1);
    // A browser tab leaves Mod+[ to the browser, whose Back is the app's.
    await page.goBack();
    await until(async () => (await focusedTitle()) === "Beta", 3000, "back");

    await link("Alpha").click({ modifiers: [MOD, "Shift"] });
    await until(async () => (await tabs(page).count()) === 2, 3000, "new tab");
    await until(async () => (await focusedTitle()) === "Alpha", 3000, "new tab focused");

    await tabs(page).filter({ hasText: "Beta" }).click();
    await link("Alpha").click({ modifiers: [MOD, "Alt"] });
    await until(async () => (await paneCount()) === 2, 3000, "split");
    // A second Mod+Alt-click reuses the pane beside.
    await page.locator("[data-testid=tab-view][data-active]").first().click();
    await tabs(page).filter({ hasText: "Beta" }).first().click();
    await link("Alpha").click({ modifiers: [MOD, "Alt"] });
    await page.waitForTimeout(300);
    expect(await paneCount()).toBe(2);
    await shot("split");
  });

  test("menu buttons open in a new tab and to the side", async () => {
    await note("Gamma", "Gamma body");
    await note("Delta", "Link [[Gamma]] here");
    await link("Gamma").click();
    await menu().getByRole("button", { name: "Open in new tab" }).click();
    await until(async () => (await tabs(page).count()) === 2, 3000, "new tab");
    await tabs(page).filter({ hasText: "Delta" }).click();
    await link("Gamma").click();
    await menu().getByRole("button", { name: "Open to the side" }).click();
    await until(async () => (await paneCount()) === 2, 3000, "split");
  });

  test("keyboard: Mod+K beside or over a hovered link opens the palette; on a selected link, the menu", async () => {
    await note("Kappa", "Kappa body");
    await note("Lambda", "x [[Kappa]]", "see web");
    // "web" becomes a Markdown link (see the pasting test for the frame wait).
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+ArrowLeft");
    await until(
      async () => (await page.evaluate(() => String(window.getSelection()))) === "web",
      3000,
      "selection",
    );
    await page.evaluate(() => navigator.clipboard.writeText("https://example.com/web"));
    await page.keyboard.press(`${MOD}+v`);
    const web = activeEditor(page).locator("a[href='https://example.com/web']");
    await web.waitFor();
    await away();
    const palette = page.getByRole("combobox", { name: "Command palette" });
    // The caret right after the wiki link, the pointer on it.
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("End");
    await link("Kappa").hover();
    await page.keyboard.press(`${MOD}+k`);
    await palette.waitFor();
    expect(await menu().count()).toBe(0);
    // The key cancelled the hover preview, so it does not open over the palette.
    await page.waitForTimeout(700);
    expect(await preview().count()).toBe(0);
    await page.keyboard.press("Escape");
    await until(async () => (await palette.count()) === 0, 2000, "palette closed");

    // A caret inside a Markdown link shows its menu; Mod+K still opens the palette and closes it.
    await web.click();
    await menu().waitFor();
    await page.keyboard.press(`${MOD}+k`);
    await palette.waitFor();
    await until(async () => (await menu().count()) === 0, 2000, "menu closed");
    await page.keyboard.press("Escape");
    await until(async () => (await palette.count()) === 0, 2000, "palette closed");

    // A selected wiki link: Mod+K moves focus into its menu; Escape returns to the editor.
    await link("Kappa").click();
    await menu().waitFor();
    await page.keyboard.press(`${MOD}+k`);
    await until(
      async () => await menu().evaluate((el) => el.contains(document.activeElement)),
      2000,
      "menu focused",
    );
    expect(await palette.count()).toBe(0);
    await page.keyboard.press("Escape");
    await until(async () => (await menu().count()) === 0, 2000, "closed");
    expect(
      await activeEditor(page).evaluate((el) => el.contains(document.activeElement)),
    ).toBeTrue();
  });

  test("edit a link's target with heading autocomplete, copy, convert and unlink", async () => {
    await note("Omega", "## First", "a", "## Second", "b");
    await note("Psi", "go [[Omega]] end");
    await link("Omega").click();
    await menu().getByRole("button", { name: "Edit link" }).click();
    const target = page.getByRole("combobox", { name: "Link target" });
    await target.fill("Omega#Sec");
    await page.getByRole("option", { name: /Second/ }).waitFor();
    await target.press("Enter");
    await link("Omega > Second").waitFor();
    await shot("edited");

    // ProseMirror takes clicks on one spot within 500 ms for a double or triple click (a word or
    // the paragraph), even with clicks on the card between them; a person is never that quick.
    const clickAgain = async (locator: ReturnType<typeof link>) => {
      await page.waitForTimeout(600);
      await locator.click();
    };
    await clickAgain(link("Omega > Second"));
    await menu().getByRole("button", { name: "Copy link" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("[[Omega#Second]]");

    await clickAgain(link("Omega > Second"));
    await menu().getByRole("button", { name: "Convert to Markdown link" }).click();
    await activeEditor(page).locator("a[href='Omega.md#Second']").waitFor();
    await clickAgain(activeEditor(page).locator("a[href='Omega.md#Second']"));
    await menu().getByRole("button", { name: "Convert to wiki link" }).click();
    await link("Omega > Second").waitFor();

    await clickAgain(link("Omega > Second"));
    await menu().getByRole("button", { name: "Remove link" }).click();
    await until(
      async () => (await activeEditor(page).locator("a").count()) === 0,
      3000,
      "unlinked",
    );
    await activeEditor(page).getByText("go Omega > Second end").waitFor();
    // One Mod+Z brings the link back.
    await page.keyboard.press(`${MOD}+z`);
    await link("Omega > Second").waitFor();
  });

  test("Mod+K over selected text creates a link; pasting a URL over a selection makes a link", async () => {
    await note("Zeta", "Zeta body");
    await note("Eta", "read about zeta");
    for (let i = 0; i < 4; i++) await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press(`${MOD}+k`);
    const target = page.getByRole("combobox", { name: "Link target" });
    await target.waitFor();
    await target.fill("Zet");
    await page.getByRole("option", { name: "Zeta" }).waitFor();
    await target.press("Enter");
    await link("zeta").waitFor();

    await page.keyboard.press("End");
    await page.keyboard.type(" docs");
    // ProseMirror reads typed text from DOM mutations and then writes its selection back: a
    // Shift+Arrow sent in the same few milliseconds (faster than anyone types) is overwritten.
    // Let a frame pass, and check the selection before pasting over it.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    for (let i = 0; i < 4; i++) await page.keyboard.press("Shift+ArrowLeft");
    await until(
      async () => (await page.evaluate(() => String(window.getSelection()))) === "docs",
      3000,
      "selection",
    );
    await page.evaluate(() => navigator.clipboard.writeText("https://example.com/docs"));
    await page.keyboard.press(`${MOD}+v`);
    await activeEditor(page).locator("a[href='https://example.com/docs']").waitFor();
    await activeEditor(page).locator("a[href='https://example.com/docs']").hover();
    await preview().getByTestId("url-preview").waitFor();
    expect(await preview().innerText()).toContain("example.com");
  });

  test("wiki links show the target's page icon and resolve live (doc.links)", async () => {
    await note("Iconic", "has an icon");
    await page.evaluate(async () => {
      const { host } = (window as any).__lydie;
      const hits = await host.backend.query("doc.search", {
        workspaceId: host.app.workspace.workspaceId,
        text: "Iconic",
        limit: 5,
      });
      const doc = hits.find((h: { title: string }) => h.title === "Iconic");
      await host.backend.ops.doc.setProperties({ id: doc.id, set: { icon: "🚀" } });
    });
    await note("Linker", "see [[Iconic]] and [[Later]]");
    await activeEditor(page).locator('[data-page-icon="🚀"]').waitFor();
    await link("Later").and(page.locator("[data-unresolved=true]")).waitFor();
    // Creating the target elsewhere resolves the link without touching this note.
    await page.evaluate(async () => {
      const { host } = (window as any).__lydie;
      await host.backend.ops.doc.create({
        workspaceId: host.app.workspace.workspaceId,
        title: "Later",
      });
    });
    await until(
      async () => (await activeEditor(page).locator("[data-unresolved=true]").count()) === 0,
      3000,
      "resolved",
    );
  });

  test("an unresolved link shows as such and creates its note beside the source", async () => {
    await note("Home", "todo [[Not yet written]]");
    await activeEditor(page).locator("a[data-unresolved=true]").waitFor();
    await link("Not yet written").hover();
    await preview().getByTestId("unresolved-preview").waitFor();
    await link("Not yet written").click();
    await menu().getByRole("button", { name: "Create note" }).click();
    await until(async () => (await focusedTitle()) === "Not yet written", 3000, "created");
    await treeItem(page, "Not yet written").waitFor();
    await page.goBack();
    await until(async () => (await focusedTitle()) === "Home", 3000, "back");
    await until(
      async () => (await activeEditor(page).locator("a[data-unresolved=true]").count()) === 0,
      5000,
      "resolved",
    );
  });

  test("embeds render the note or section read-only with an open affordance", async () => {
    await note("Embedded", "## Keep", "kept text", "## Skip", "skipped text");
    await note("Host", "![[Embedded#Keep]]");
    const embed = activeEditor(page).getByTestId("embed");
    await embed.waitFor();
    await embed.getByText("kept text").waitFor();
    expect(await embed.innerText()).not.toContain("skipped text");
    await shot("embed");
    await embed.getByRole("button", { name: "Open Embedded" }).click();
    await until(async () => (await focusedTitle()) === "Embedded", 3000, "opened");
  });
});

describe("slash menu", () => {
  test("filters fuzzily, inserts blocks, and lists the recently used first", async () => {
    await note("Slashy", "start");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/hd2", { delay: 20 });
    const menu = page.getByRole("listbox", { name: "Insert block" });
    await menu.waitFor();
    expect((await menu.getByRole("option").first().innerText()).trim()).toContain("Heading 2");
    await page.keyboard.press("Enter");
    await page.keyboard.type("A heading");
    await activeEditor(page).locator("h2", { hasText: "A heading" }).waitFor();
    await page.keyboard.press("Enter");
    await page.keyboard.type("/todo", { delay: 20 });
    await menu.getByRole("option", { name: /Task List/ }).waitFor();
    await page.keyboard.press("Enter");
    await page.keyboard.type("Buy milk");
    await activeEditor(page)
      .locator("ul[data-type=taskList]")
      .getByText("Buy milk", { exact: true })
      .waitFor();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/", { delay: 20 });
    await menu.waitFor();
    const first = await menu.getByRole("option").allInnerTexts();
    expect(first[0]).toContain("Task List");
    expect(first[1]).toContain("Heading 2");
    await shot("slash");
    // Commands on the open document are reachable by typing; app-wide ones stay in the palette.
    await page.keyboard.type("document", { delay: 20 });
    await menu.getByRole("option", { name: /Delete document/ }).waitFor();
    expect(
      await menu.getByRole("option", { name: /New document|Collapse all documents/ }).count(),
    ).toBe(0);
    await page.keyboard.press("Escape");
  });

  test("link to page and embed page through the picker", async () => {
    await note("Pickable", "picked body");
    await note("Picker host", "x");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/linkpage", { delay: 20 });
    const menu = page.getByRole("listbox", { name: "Insert block" });
    await menu.getByRole("option").first().filter({ hasText: "Link to page" }).waitFor();
    await page.keyboard.press("Enter");
    const box = page.getByRole("combobox", { name: "Link to page" });
    await box.fill("Pickab");
    await page.getByRole("option", { name: "Pickable" }).waitFor();
    await box.press("Enter");
    await link("Pickable").waitFor();
    // The picker hands focus back to the editor once it has closed.
    await until(
      async () => await activeEditor(page).evaluate((el) => el.contains(document.activeElement)),
      3000,
      "editor focus",
    );
    await page.keyboard.press("Enter");
    await page.keyboard.type("/embed", { delay: 20 });
    await menu.getByRole("option").first().filter({ hasText: "Embed page" }).waitFor();
    await page.keyboard.press("Enter");
    const embedBox = page.getByRole("combobox", { name: "Embed page" });
    await embedBox.fill("Pickab");
    await page.getByRole("option", { name: "Pickable" }).waitFor();
    await embedBox.press("Enter");
    await activeEditor(page).getByTestId("embed").getByText("picked body").waitFor();
  });
});

describe("quick switcher", () => {
  async function open() {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press(`${MOD}+o`);
    const box = page.getByRole("combobox", { name: "Quick switcher" });
    await box.waitFor();
    return box;
  }

  test("ranks by frecency, creates on Enter, opens in a new tab and to the side", async () => {
    await note("Roadmap notes", "a");
    await note("Quarterly roadmap", "b");
    // Open "Quarterly roadmap" a few more times so it outranks the prefix match.
    for (let i = 0; i < 14; i++) {
      await treeItem(page, "Getting started").click();
      await treeItem(page, "Quarterly roadmap").click();
    }
    let box = await open();
    // Recent documents on an empty query.
    await page.getByRole("option", { name: /Quarterly roadmap/ }).waitFor();
    await box.fill("roadmap");
    const options = page.getByRole("option");
    await until(async () => (await options.count()) >= 2, 3000, "options");
    expect(await options.first().innerText()).toContain("Quarterly roadmap");
    await box.press(`${MOD}+Enter`);
    await until(async () => (await tabs(page).count()) === 2, 3000, "new tab");

    box = await open();
    await box.fill("Roadmap notes");
    await page
      .getByRole("option", { name: /Roadmap notes/ })
      .first()
      .waitFor();
    await box.press(`${MOD}+Alt+Enter`);
    await until(async () => (await paneCount()) === 2, 3000, "split");

    box = await open();
    await box.fill("Brand new page");
    await page.getByRole("option", { name: /Create “Brand new page”/ }).waitFor();
    await box.press("Enter");
    await until(async () => (await focusedTitle()) === "Brand new page", 3000, "created");
  });

  test("# lists the active note's headings, > runs commands", async () => {
    await note("Long read", "## Alpha part", "x", "## Beta part", "y");
    let box = await open();
    await box.fill("#beta");
    await page.getByRole("option", { name: /Beta part/ }).waitFor();
    await box.press("Enter");
    box = await open();
    await box.fill(">show outline");
    await page.getByRole("option", { name: /Show outline/ }).waitFor();
    await box.press("Enter");
    await page.getByTestId("outline").waitFor();
  });
});

describe("outline and backlinks", () => {
  test("outline follows the editor live and scrolls on click", async () => {
    const filler = Array.from({ length: 30 }, (_, i) => `Line ${i}`);
    await note(
      "Outlined",
      "## First heading",
      ...filler,
      "## Second heading",
      ...filler,
      "## Third heading",
      ...filler,
    );
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press(`${MOD}+o`);
    const box = page.getByRole("combobox", { name: "Quick switcher" });
    await box.fill(">show outline");
    await box.press("Enter");
    const outline = page.getByTestId("outline");
    await outline.getByRole("button", { name: "Third heading" }).waitFor();
    await outline.getByRole("button", { name: "Third heading" }).click();
    await until(
      async () =>
        (await outline
          .getByRole("button", { name: "Third heading" })
          .getAttribute("aria-current")) === "location",
      3000,
      "current section",
    );
    // Live: a new heading shows without a save.
    await activeEditor(page).press(`${MOD}+End`);
    await page.keyboard.press("Enter");
    await page.keyboard.type("## Fourth heading");
    await outline.getByRole("button", { name: "Fourth heading" }).waitFor({ timeout: 2000 });
    await shot("outline");
  });

  test("backlinks show context; an unlinked mention links in one click and Mod+Z undoes it", async () => {
    await note("Garden", "About plants.");
    await note("Diary", "Spent the day in the [[Garden]] weeding.");
    await note("Plans", "Next week: water the garden again.");
    await treeItem(page, "Garden").click();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press(`${MOD}+Alt+]`);
    const panel = page.getByTestId("links-panel");
    await panel.getByTestId("backlink").getByText("weeding", { exact: false }).waitFor();
    const mention = panel.getByTestId("unlinked-mention").filter({ hasText: "Plans" });
    await mention.waitFor();
    await mention.getByRole("button", { name: "Link mention in Plans" }).click();
    await panel.getByTestId("backlink").filter({ hasText: "Plans" }).waitFor();
    await until(
      async () => (await panel.getByTestId("unlinked-mention").count()) === 0,
      5000,
      "linked",
    );
    await shot("backlinks");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press(`${MOD}+z`);
    await panel.getByTestId("unlinked-mention").filter({ hasText: "Plans" }).waitFor();
  });
});

describe("page icons and quick capture", () => {
  test("an icon set on a page shows in its tab, the switcher and link previews; Mod+Z removes it", async () => {
    await note("Rocket", "Launch plans");
    await note("Mission", "See [[Rocket]]");
    await treeItem(page, "Rocket").click();
    const view = page.locator("[data-testid=tab-view][data-focused]");
    // Hidden until the title (or the buttons' own row) is hovered, and kept while the picker is open.
    await view.getByRole("textbox", { name: "Title" }).hover();
    const add = view.getByTestId("page-decor").getByRole("button", { name: "Add icon" });
    await add.click();
    await page.getByRole("button", { name: "Icon 🚀" }).waitFor();
    await page.mouse.move(0, 0);
    await until(
      async () => (await add.evaluate((el) => getComputedStyle(el.parentElement!).opacity)) === "1",
      2000,
      "buttons stay while the picker is open",
    );
    await page.getByRole("button", { name: "Icon 🚀" }).click();
    await tabs(page).filter({ hasText: "Rocket" }).locator("[data-page-icon='🚀']").waitFor();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press(`${MOD}+o`);
    const box = page.getByRole("combobox", { name: "Quick switcher" });
    await box.fill("Rocket");
    await page
      .getByRole("option", { name: /Rocket/ })
      .locator("[data-page-icon='🚀']")
      .waitFor();
    await box.press("Escape");
    await treeItem(page, "Mission").click();
    await link("Rocket").hover();
    await preview().locator("[data-page-icon='🚀']").waitFor();
    await shot("icon");
    await pointerAway();
    await treeItem(page, "Rocket").click();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press(`${MOD}+z`);
    await until(
      async () =>
        (await tabs(page).filter({ hasText: "Rocket" }).locator("[data-page-icon]").count()) === 0,
      3000,
      "icon undone",
    );
  });

  test("quick capture appends to the inbox", async () => {
    // Its shortcut, Mod+Shift+I, is the browser's in a browser tab: open it from the palette.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press(`${MOD}+k`);
    const palette = page.getByRole("combobox", { name: "Command palette" });
    await palette.fill("quick capture");
    await page.getByRole("option", { name: /Quick capture/ }).waitFor();
    await palette.press("Enter");
    const box = page.getByRole("textbox", { name: "Capture" });
    await box.fill("Idea: tiny app");
    await box.press("Enter");
    await treeItem(page, "Inbox").click();
    await activeEditor(page)
      .getByText(/\d\d:\d\d Idea: tiny app/)
      .waitFor();
    await shot("capture");
  });
});

describe("mentions", () => {
  test("@ links a page and today's date (as wiki links)", async () => {
    await note("Budget", "Numbers");
    await note("Meeting log", "Discussed ");
    await page.keyboard.type("@budg", { delay: 20 });
    const menu = page.getByRole("listbox", { name: "Mention" });
    await menu.getByRole("option", { name: /Budget/ }).waitFor();
    await page.keyboard.press("Enter");
    await link("Budget").waitFor();
    await page.keyboard.type("on @tod", { delay: 20 });
    await menu.getByRole("option", { name: /Today/ }).waitFor();
    await page.keyboard.press("Enter");
    const today = await page.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
    await link(today).waitFor();
    await shot("mentions");
  });
});
