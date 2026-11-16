// Main flows of the web app in a real browser, so restyling cannot silently break behaviour.
// Elements are found by role, label or test id only. Run: `bun run test:e2e` (builds first).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import type { BrowserContext, Page } from "playwright";

import {
  activeEditor,
  activeTitle,
  createDoc,
  MOD,
  newProfile,
  openApp,
  screenshot,
  startServer,
  tabs,
  tree,
  treeItem,
  until,
  watchErrors,
} from "./helpers.ts";
import type { Server } from "./helpers.ts";

let server: Server;
let context: BrowserContext;
let page: Page;
let errors: string[];

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await server?.stop();
});

beforeEach(async () => {
  context = await newProfile();
  page = await openApp(context, server.url);
  errors = watchErrors(page);
});

afterEach(async () => {
  await context?.close();
  expect(errors).toEqual([]);
});

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

async function reload() {
  await page.reload();
  await page.getByTestId("app-shell").waitFor({ timeout: 30_000 });
}

describe("documents", () => {
  test("first run opens the Getting started page", async () => {
    await treeItem(page, "Getting started").waitFor();
    await expect(activeTitle(page).inputValue()).resolves.toBe("Getting started");
    await activeEditor(page).getByText("Links and backlinks").first().waitFor();
    await screenshot(page, "e2e-first-run");
  });

  test("create, edit and reload keeps the document", async () => {
    await createDoc(page, "Groceries", "Tomatoes and coffee");
    // Let the debounced save land.
    await page.waitForTimeout(800);
    await reload();
    await treeItem(page, "Groceries").click();
    await activeEditor(page).getByText("Tomatoes and coffee").waitFor();
  });

  test("rename inline, undo and redo", async () => {
    await createDoc(page, "Draft");
    await treeItem(page, "Draft").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const input = tree(page).getByRole("textbox", { name: "Document title" });
    await input.fill("Final");
    await input.press("Enter");
    await treeItem(page, "Final").waitFor();
    await undo();
    await treeItem(page, "Draft").waitFor();
    await redo();
    await treeItem(page, "Final").waitFor();
  });

  test("move by drag and drop into another document, then undo", async () => {
    await createDoc(page, "Folder");
    await createDoc(page, "Child");
    await treeItem(page, "Child").dragTo(treeItem(page, "Folder"));
    await until(
      async () => (await treeItem(page, "Folder").getAttribute("aria-expanded")) === "true",
      5000,
      "folder expands",
    );
    await expect(treeItem(page, "Child").getAttribute("aria-level")).resolves.toBe("2");
    await undo();
    await until(
      async () => (await treeItem(page, "Child").getAttribute("aria-level")) === "1",
      5000,
      "child back at top",
    );
  });

  test("delete to trash, undo, delete again, restore from the trash, purge", async () => {
    await createDoc(page, "Old idea");
    await treeItem(page, "Old idea").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Move to trash" }).click();
    await until(async () => (await treeItem(page, "Old idea").count()) === 0, 5000, "deleted");
    await undo();
    await treeItem(page, "Old idea").waitFor();

    await treeItem(page, "Old idea").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Move to trash" }).click();
    await page.getByRole("link", { name: "Trash" }).click();
    const item = page.getByTestId("trash-item").filter({ hasText: "Old idea" });
    await item.waitFor();
    await screenshot(page, "e2e-trash");
    await item.getByRole("button", { name: "Restore" }).click();
    await treeItem(page, "Old idea").waitFor();

    await treeItem(page, "Old idea").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Move to trash" }).click();
    await page.getByRole("link", { name: "Trash" }).click();
    await page.getByRole("button", { name: "Delete Old idea forever" }).click();
    await page
      .getByRole("alertdialog")
      .filter({ hasText: "Delete “Old idea” forever?" })
      .getByRole("button", { name: "Delete forever" })
      .click();
    await page
      .locator("[data-testid=tab-view][data-focused]")
      .getByText("The trash is empty")
      .waitFor();
  });
});

// The app's own new tab, from a tree row's menu (Cmd-click on the row is the browser's).
async function openInNewTab(page: Page, title: string) {
  await treeItem(page, title).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Open in new tab" }).click();
}

describe("tabs", () => {
  test("open in a new tab, switch, close, reopen, split, back and forward, restore after reload", async () => {
    await createDoc(page, "Alpha");
    await createDoc(page, "Beta");
    // Tree rows are links: Cmd-click is the browser's, a browser tab at the page's URL.
    const [popup] = await Promise.all([
      context.waitForEvent("page"),
      treeItem(page, "Alpha")
        .getByRole("link")
        .click({ modifiers: [MOD] }),
    ]);
    await until(async () => /\/d\/alpha-[0-9a-f]{32}$/.test(popup.url()), 5000, "page URL");
    await popup.close();
    await expect(tabs(page).count()).resolves.toBe(1);
    // The app's own new tab is in the row's menu.
    await openInNewTab(page, "Alpha");
    await until(async () => (await tabs(page).count()) === 2, 5000, "two tabs");
    await expect(activeTitle(page).inputValue()).resolves.toBe("Alpha");
    // A browser tab leaves Cmd+1…9, Cmd+W, Cmd+Shift+T and Cmd+[ / ] to the browser
    // (`isBrowserShortcut`), so this goes through the tabs, the palette and the browser's history.
    // Switch by clicking.
    await tabs(page).nth(0).click();
    await expect(activeTitle(page).inputValue()).resolves.toBe("Beta");
    await tabs(page).nth(1).click();
    await expect(activeTitle(page).inputValue()).resolves.toBe("Alpha");
    // Close and reopen.
    await tabs(page).nth(1).getByRole("button", { name: "Close tab" }).click();
    await until(async () => (await tabs(page).count()) === 1, 5000, "closed");
    await blur();
    await page.keyboard.press(`${MOD}+k`);
    const palette = page.getByRole("combobox", { name: "Command palette" });
    await palette.fill("reopen closed tab");
    await page.getByRole("option", { name: /Reopen closed tab/ }).waitFor();
    await palette.press("Enter");
    await until(async () => (await tabs(page).count()) === 2, 5000, "reopened");
    await blur();
    // Split right.
    await page.keyboard.press(`${MOD}+\\`);
    await until(async () => (await page.getByTestId("tab-group").count()) === 2, 5000, "split");
    await screenshot(page, "e2e-split");
    // Back and forward inside a tab.
    await treeItem(page, "Beta").click();
    await expect(activeTitle(page).inputValue()).resolves.toBe("Beta");
    const showing = (title: string) =>
      until(async () => (await activeTitle(page).inputValue()) === title, 5000, `shows ${title}`);
    await page.goBack();
    await showing("Alpha");
    await page.goForward();
    await showing("Beta");
    // The layout comes back after a reload.
    const before = await page.getByTestId("tab").allTextContents();
    await page.waitForTimeout(500);
    await reload();
    await until(
      async () => (await page.getByTestId("tab-group").count()) === 2,
      10_000,
      "restored split",
    );
    await until(
      async () =>
        JSON.stringify(await page.getByTestId("tab").allTextContents()) === JSON.stringify(before),
      10_000,
      "restored tabs",
    );
  });

  test("drag a tab to the right edge makes a split", async () => {
    await createDoc(page, "Left");
    await openInNewTab(page, "Getting started");
    await until(async () => (await tabs(page).count()) === 2, 5000, "two tabs");
    const group = page.getByTestId("tab-group").first();
    const box = (await group.boundingBox())!;
    await tabs(page)
      .nth(1)
      .dragTo(group, { targetPosition: { x: box.width - 20, y: box.height / 2 } });
    await until(
      async () => (await page.getByTestId("tab-group").count()) === 2,
      5000,
      "split by drag",
    );
  });
});

describe("navigation", () => {
  test("the address bar follows the focused tab; Back, Forward and a link work", async () => {
    const path = () => new URL(page.url()).pathname;
    const showing = (title: string) =>
      until(async () => (await activeTitle(page).inputValue()) === title, 5000, `shows ${title}`);
    await createDoc(page, "Alpha");
    await createDoc(page, "Beta");
    // The title is in the URL, in front of the id.
    await until(async () => /^\/d\/beta-[0-9a-f]{32}$/.test(path()), 5000, "a document URL");
    const beta = path();
    await treeItem(page, "Alpha").click();
    await showing("Alpha");
    await until(async () => /^\/d\/alpha-[0-9a-f]{32}$/.test(path()), 5000, "Alpha's URL");
    const alpha = path();
    expect(alpha).not.toBe(beta);

    await page.goBack();
    await showing("Beta");
    expect(path()).toBe(beta);
    await page.goForward();
    await showing("Alpha");
    expect(path()).toBe(alpha);

    // A reload stays on the page; a link opens its page beside what was open.
    await reload();
    await showing("Alpha");
    expect(path()).toBe(alpha);
    const before = await tabs(page).count();
    // Let the debounced layout save land.
    await page.waitForTimeout(500);
    await page.goto(new URL(beta, server.url).toString());
    await page.getByTestId("app-shell").waitFor({ timeout: 30_000 });
    await showing("Beta");
    expect(await tabs(page).count()).toBe(before + 1);
    expect(path()).toBe(beta);
  });

  test("quick switcher finds a document by fuzzy title", async () => {
    await createDoc(page, "Quarterly roadmap");
    await treeItem(page, "Getting started").click();
    await blur();
    await page.keyboard.press(`${MOD}+o`);
    const box = page.getByRole("combobox", { name: "Quick switcher" });
    await box.waitFor();
    await box.pressSequentially("qrtrly", { delay: 10 });
    await page.getByRole("option", { name: /Quarterly roadmap/ }).waitFor();
    await screenshot(page, "e2e-quick-switcher");
    await box.press("Enter");
    await until(
      async () => (await activeTitle(page).inputValue()) === "Quarterly roadmap",
      5000,
      "opened",
    );
  });

  test("full-text search finds body text", async () => {
    await createDoc(page, "Recipes", "Grandma's tomato soup with basil");
    await page.waitForTimeout(800);
    await blur();
    await page.keyboard.press(`${MOD}+Shift+f`);
    const field = page.getByRole("searchbox", { name: "Search documents" });
    await field.waitFor();
    await field.fill("basil");
    const result = page.getByTestId("search-result").filter({ hasText: "Recipes" });
    await result.waitFor();
    await screenshot(page, "e2e-search");
    await result.click();
    await until(
      async () => (await activeTitle(page).inputValue()) === "Recipes",
      5000,
      "opened result",
    );
  });

  test("wiki-link autocomplete, navigation and backlinks", async () => {
    await createDoc(page, "Target note");
    await createDoc(page, "Source note");
    await activeEditor(page).click();
    await page.keyboard.type("See [[Targ", { delay: 20 });
    await page
      .getByRole("listbox", { name: "Link to document" })
      .getByText("Target note")
      .waitFor();
    await page.keyboard.press("Enter");
    await activeEditor(page).getByText("Target note").waitFor();
    await page.waitForTimeout(800);
    // The right panel shows backlinks of the open document.
    await activeEditor(page)
      .getByText("Target note")
      .click({ modifiers: [MOD] });
    await until(
      async () => (await activeTitle(page).inputValue()) === "Target note",
      5000,
      "followed link",
    );
    await page.getByRole("button", { name: "Show right panel" }).click();
    await page.getByRole("list", { name: "Backlinks" }).getByText("Source note").waitFor();
    await screenshot(page, "e2e-backlinks");
  });

  test("command palette runs a command", async () => {
    await blur();
    await page.keyboard.press(`${MOD}+k`);
    const box = page.getByRole("combobox", { name: "Command palette" });
    await box.waitFor();
    await box.fill("split right");
    await screenshot(page, "e2e-palette");
    await box.press("Enter");
    await until(
      async () => (await page.getByTestId("tab-group").count()) === 2,
      5000,
      "split from palette",
    );
  });

  test("sidebar collapses completely and comes back", async () => {
    const sidebarHidden = async () => !(await page.getByTestId("sidebar").isVisible());
    const sidebarWidth = () =>
      page.locator("#app-sidebar").evaluate((el) => el.getBoundingClientRect().width);
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await until(sidebarHidden, 5000, "collapsed");
    await until(async () => (await sidebarWidth()) === 0, 5000, "collapsed to 0");
    await screenshot(page, "e2e-sidebar-collapsed");
    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await page.getByTestId("sidebar").waitFor();
    // Also by keyboard.
    await blur();
    await page.keyboard.press(`${MOD}+Alt+[`);
    await until(sidebarHidden, 5000, "collapsed by key");
    await reload();
    await page.getByRole("button", { name: "Expand sidebar" }).waitFor();
    await until(sidebarHidden, 5000, "stays collapsed");
  });

  test("the sidebar's edge drags it collapsed and open", async () => {
    const handle = page.getByRole("separator", { name: "Resize sidebar" });
    const width = () =>
      page.locator("#app-sidebar").evaluate((el) => el.getBoundingClientRect().width);
    const drag = async (dx: number) => {
      const box = (await handle.boundingBox())!;
      const y = box.y + box.height / 2;
      await page.mouse.move(box.x + box.width / 2, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + dx, y, { steps: 12 });
      await page.mouse.up();
    };
    // Pushed past the midpoint below the minimum width, it collapses completely.
    await drag(-300);
    await until(async () => (await width()) === 0, 3000, "collapsed to 0");
    await until(async () => !(await page.getByTestId("sidebar").isVisible()), 3000, "collapsed");
    // Reopened from the tab row, it follows the pointer and keeps the width it is left at.
    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await page.getByTestId("sidebar").waitFor();
    let last = -1;
    await until(
      async () => {
        const now = await width();
        const settled = now >= 200 && now === last;
        last = now;
        await page.waitForTimeout(100);
        return settled;
      },
      3000,
      "reopened",
    );
    const target = last + 80;
    await drag(80);
    await until(async () => Math.abs((await width()) - target) < 2, 3000, "follows the pointer");
    await reload();
    await until(async () => Math.abs((await width()) - target) < 2, 3000, "width kept");
  });
});

describe("storage", () => {
  test("two pages of the app at once share one database, or hand it over cleanly", async () => {
    const second = await context.newPage();
    const secondErrors = watchErrors(second);
    await second.goto(server.url);
    const otherTab = second.getByText("Lydie is open in another tab");
    await Promise.race([
      second.getByTestId("app-shell").waitFor({ timeout: 30_000 }),
      otherTab.waitFor({ timeout: 30_000 }),
    ]);
    if (await otherTab.isVisible()) {
      // Single-tab browsers (no shared worker): the second page offers to take over.
      await createDoc(page, "Kept from page one");
      await second.getByRole("button", { name: "Use Lydie here" }).click();
      await second.getByTestId("app-shell").waitFor({ timeout: 30_000 });
      await page.getByText("Lydie was opened in another tab").waitFor();
      await treeItem(second, "Kept from page one").waitFor({ timeout: 10_000 });
      expect(secondErrors).toEqual([]);
      return;
    }
    await createDoc(page, "From page one");
    await createDoc(second, "From page two");
    await treeItem(second, "From page one").waitFor({ timeout: 10_000 });
    await treeItem(page, "From page two").waitFor({ timeout: 10_000 });
    await second.close();
    await reload();
    await treeItem(page, "From page one").waitFor();
    await treeItem(page, "From page two").waitFor();
    expect(secondErrors).toEqual([]);
  });

  test("embed mode posts a ready message to the parent", async () => {
    // A real navigation, so this page lets go of the database before the frame opens it.
    await page.route("**/embed-host", (route) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Host</title>" }),
    );
    await page.goto(`${server.url}embed-host`);
    const message = await page.evaluate(
      () =>
        new Promise<unknown>((resolve) => {
          window.addEventListener("message", (event) => resolve(event.data), { once: true });
          const frame = document.createElement("iframe");
          frame.src = "/?embed=1";
          frame.style.cssText = "width:1000px;height:700px";
          document.body.append(frame);
        }),
    );
    expect(message).toEqual({ type: "lydie:embed-ready" });
  });
});
