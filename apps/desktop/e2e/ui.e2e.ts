// The real UI in the desktop app on a folder: typing in a note changes only that block of the
// file. Loads apps/web/.e2e/desktop over the app scheme (LYDIE_WEB_DIST); the desktop `test:e2e`
// script builds it first, so this never runs against a stale apps/web/dist.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright-core";
import type { ElectronApplication, Page } from "playwright-core";

import { launchEnv } from "./env.ts";
import { poll } from "./poll.ts";

const electronBinary = createRequire(import.meta.url)("electron") as string;
const mainScript = resolve(import.meta.dirname, "../out/main/index.js");
const webDist = resolve(import.meta.dirname, "../../web/.e2e/desktop");
const webBuild = join(webDist, "index.html");

const ORIGINAL =
  "---\ntags: [demo]\n# a comment Lydie must keep\n---\n" +
  "First   paragraph,  odd spacing.\n\n" +
  "*   star bullet\n*   another\n\n" +
  "Last paragraph.\n";

let base: string;
let folder: string;
let app: ElectronApplication;
let page: Page;

describe.skipIf(!existsSync(webBuild))("desktop UI on a folder", () => {
  beforeAll(async () => {
    base = await realpath(await mkdtemp(join(tmpdir(), "lydie-e2e-ui-")));
    folder = join(base, "vault");
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "Note.md"), ORIGINAL);
    await writeFile(join(folder, "Other.md"), "Other note.\n");
    // For the link settings: a unique note two folders down, and two notes named Plan.
    await mkdir(join(folder, "Projects", "Notes"), { recursive: true });
    await mkdir(join(folder, "Archive"), { recursive: true });
    await writeFile(join(folder, "Projects", "Notes", "Daily log.md"), "Daily.\n");
    await writeFile(join(folder, "Projects", "Plan.md"), "Plan.\n");
    await writeFile(join(folder, "Archive", "Plan.md"), "Old plan.\n");
    await writeFile(join(folder, "Links.md"), "Links:\n");
    app = await electron.launch({
      executablePath: electronBinary,
      args: [mainScript, `--open-folder=${folder}`],
      env: launchEnv({ LYDIE_USER_DATA: join(base, "user-data"), LYDIE_WEB_DIST: webDist }),
    });
    page = await app.firstWindow();
    await page.getByTestId("app-shell").waitFor({ timeout: 30_000 });
  });

  afterAll(async () => {
    await app?.close();
    await rm(base, { recursive: true, force: true });
  });

  it("typing changes only the edited block on disk", async () => {
    const tree = page.getByRole("tree", { name: "Documents" });
    await tree.getByRole("treeitem").filter({ hasText: "Note" }).first().click();
    const editor = page.locator("[data-testid=tab-view][data-focused] [data-doc-content]");
    const last = editor.getByText("Last paragraph.");
    await last.waitFor();
    await last.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Typed in Lydie.", { delay: 10 });
    const expected = ORIGINAL.replace("Last paragraph.", "Last paragraph. Typed in Lydie.");
    const disk = await poll(
      () => readFile(join(folder, "Note.md"), "utf8"),
      (text) => text === expected,
      10_000,
    );
    expect(disk).toBe(expected);
    await page.screenshot({ path: join(tmpdir(), "lydie-desktop-vault.png") });
  });

  it("shows a note another program writes into the folder", async () => {
    await writeFile(join(folder, "Dropped.md"), "Dropped by another program.\n");
    const tree = page.getByRole("tree", { name: "Documents" });
    await tree
      .getByRole("treeitem")
      .filter({ hasText: "Dropped" })
      .first()
      .waitFor({ timeout: 10_000 });
  });

  it("links typed with [[ follow the folder's link settings, changed live", async () => {
    await page
      .getByRole("tree", { name: "Documents" })
      .getByRole("treeitem", { name: /^Links/ })
      .click();
    const editor = page.locator("[data-testid=tab-view][data-focused] [data-doc-content]");
    await editor.getByText("Links:").click();
    const setSettings = (patch: object) =>
      page.evaluate(async (patch) => {
        const settings = (window as any).__lydie.host.app.services.vault.settings;
        await settings.set(patch);
        return settings.current();
      }, patch);
    const link = async (query: string, pick: RegExp) => {
      await page.keyboard.press("End");
      await page.keyboard.type(` [[${query}`, { delay: 15 });
      const menu = page.getByRole("listbox", { name: "Link to document" });
      await menu.getByRole("option", { name: pick }).first().waitFor({ timeout: 10_000 });
      await page.keyboard.press("Enter");
    };
    const disk = (accept: (text: string) => boolean) =>
      poll(() => readFile(join(folder, "Links.md"), "utf8"), accept, 10_000);

    // Markdown, relative to the linking note (top level here).
    expect(await setSettings({ linkFormat: "markdown", linkPath: "relative" })).toMatchObject({
      linkFormat: "markdown",
      linkPath: "relative",
    });
    await link("Daily", /Daily log/);
    let text = await disk((t) => t.includes("](Projects/Notes/Daily%20log.md)"));
    expect(text).toContain("[Daily log](Projects/Notes/Daily%20log.md)");

    // Changed in the same window: wiki links with the full path.
    await setSettings({ linkFormat: "wiki", linkPath: "absolute" });
    await link("Daily", /Daily log/);
    text = await disk((t) => t.includes("[[Projects/Notes/Daily log]]"));
    expect(text).toContain("[[Projects/Notes/Daily log]]");

    // Shortest: a unique name stays short; a shared name gets its path.
    await setSettings({ linkFormat: "wiki", linkPath: "shortest" });
    await link("Daily", /Daily log/);
    await link("Plan", /Plan/);
    text = await disk(
      (t) => /\[\[(Projects|Archive)\/Plan\]\]/.test(t) && t.includes(" [[Daily log]]"),
    );
    expect(text).toContain(" [[Daily log]]");
    expect(text).toMatch(/\[\[(Projects|Archive)\/Plan\]\]/);
    await setSettings({ linkFormat: null, linkPath: null });
  });
});
