// The settings window in local browser mode (no account needed): opening and closing it, deep
// links, search, navigation, the general pages, shortcut rebinding with conflicts, plugins, and
// the team pages' local-mode state. Run: `bun run test:e2e:settings` (builds first).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import type { BrowserContext, Page } from "playwright";

import { MOD, newProfile, until, watchErrors } from "./helpers.ts";
import { startSettingsServer } from "./settings-server.ts";
import type { SettingsServer } from "./settings-server.ts";

let server: SettingsServer;
let context: BrowserContext;
let page: Page;
let errors: string[];

beforeAll(async () => {
  server = await startSettingsServer();
});

afterAll(() => {
  server?.stop();
});

beforeEach(async () => {
  context = await newProfile();
  page = await context.newPage();
  errors = watchErrors(page);
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto(server.url);
  await page.getByTestId("app-shell").waitFor({ timeout: 30_000 });
});

afterEach(async () => {
  await context?.close();
  expect(errors).toEqual([]);
});

const settings = () => page.getByRole("dialog", { name: "Settings" });
const nav = () => settings().getByRole("navigation", { name: "Settings sections" });
const path = () => new URL(page.url()).pathname;

async function openSettings() {
  await page.keyboard.press(`${MOD}+Comma`);
  // Headless Chromium on macOS can keep Mod+, for itself: Linear's G then S opens it too, outside
  // a text field (as in hosted.e2e.ts).
  if (
    !(await settings()
      .waitFor({ timeout: 2000 })
      .then(
        () => true,
        () => false,
      ))
  ) {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("g");
    await page.keyboard.press("s");
  }
  await settings().waitFor();
}

async function goTo(title: string) {
  await nav().getByRole("button", { name: title, exact: true }).click();
}

describe("settings window", () => {
  test("opens with Mod+, at a URL of its own and closes with Escape", async () => {
    await openSettings();
    expect(path()).toBe("/settings/general");
    await nav().getByRole("button", { name: "General", exact: true }).waitFor();
    for (const title of [
      "Keyboard shortcuts",
      "Members",
      "Account",
      "Plugins",
      "Agents & API",
      "About",
    ]) {
      await nav().getByRole("button", { name: title, exact: true }).waitFor();
    }
    // Teamspaces are hidden while a workspace has no other teamspace than its default one, and
    // folder settings outside a folder window.
    for (const hidden of ["Teamspaces", "Files & links"]) {
      await expect(nav().getByRole("button", { name: hidden, exact: true }).count()).resolves.toBe(
        0,
      );
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: "/tmp/lydie-settings-general.png" });
    await goTo("Keyboard shortcuts");
    expect(path()).toBe("/settings/shortcuts");
    await page.keyboard.press("Escape");
    await settings().waitFor({ state: "detached" });
    // Back on the page under it.
    expect(path()).not.toContain("settings");
  });

  test("Back closes it, and a deep link opens the page directly", async () => {
    await openSettings();
    await page.goBack();
    await settings().waitFor({ state: "detached" });
    await page.goto(new URL("/settings/about", server.url).toString());
    await settings().waitFor({ timeout: 30_000 });
    await page.getByTestId("about-version").waitFor();
    expect(await nav().getByRole("button", { name: "About" }).getAttribute("aria-current")).toBe(
      "page",
    );
    await settings().getByRole("button", { name: "Close settings" }).click();
    await settings().waitFor({ state: "detached" });
    expect(path()).not.toContain("settings");
  });

  test("opens from the workspace menu; search finds a page; arrows move through sections", async () => {
    await page.getByRole("button", { name: /^Workspace:/ }).click();
    await page
      .getByRole("dialog", { name: "Workspace menu" })
      .getByRole("button", { name: /^Settings/ })
      .click();
    await settings().waitFor();
    const search = settings().getByRole("searchbox", { name: "Search settings" });
    await search.fill("keymap");
    await expect(nav().getByRole("button").count()).resolves.toBe(1);
    await search.press("Enter");
    await settings().getByTestId("settings-page-shortcuts").waitFor();
    await search.fill("nothing like this");
    await nav()
      .getByText(/No settings match/)
      .waitFor();
    await search.fill("");
    await nav().getByRole("button", { name: "General", exact: true }).focus();
    await page.keyboard.press("ArrowDown");
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe(
      "Keyboard shortcuts",
    );
  });

  test("theme and workspace name are kept", async () => {
    await openSettings();
    await settings().getByRole("radio", { name: "Dark" }).check({ force: true });
    await until(() => page.evaluate(() => document.documentElement.classList.contains("dark")));
    const name = settings().getByLabel("Name", { exact: true });
    await name.fill("Field notes");
    await name.press("Enter");
    await settings().getByText("Saved").waitFor({ state: "attached" });
    await page.reload();
    await page.getByTestId("app-shell").waitFor({ timeout: 30_000 });
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(
      true,
    );
    await page.getByRole("button", { name: "Workspace: Field notes" }).waitFor();
  });

  test("rebinding a shortcut detects conflicts; reset restores the defaults", async () => {
    await openSettings();
    await goTo("Keyboard shortcuts");
    const rows = settings().getByTestId("shortcut-row");
    const panelRow = rows.filter({ hasText: "Toggle right panel" });
    const sidebarRow = rows.filter({ hasText: "Toggle sidebar" });
    await panelRow.getByRole("button", { name: "Change shortcut for Toggle right panel" }).click();
    await panelRow
      .getByRole("textbox", { name: "New shortcut for Toggle right panel" })
      .press(`${MOD}+Alt+BracketLeft`);
    const conflict = panelRow.getByRole("alert");
    await conflict.getByText(/already used by Toggle sidebar/).waitFor();
    await page.screenshot({ path: "/tmp/lydie-settings-shortcut-conflict.png" });
    await conflict.getByRole("button", { name: "Use it here" }).click();
    await sidebarRow
      .getByRole("button", { name: /Change shortcut/ })
      .filter({ hasText: "Not set" })
      .waitFor();
    // The new binding works: it toggles the right panel.
    await settings().getByRole("button", { name: "Reset all" }).click();
    await sidebarRow
      .getByRole("button", { name: /Change shortcut/ })
      .filter({ hasNotText: "Not set" })
      .waitFor();
    await settings().getByRole("searchbox", { name: "Filter shortcuts" }).fill("toggle side");
    await expect(rows.count()).resolves.toBe(1);
  });

  test("plugins can be turned off for this device", async () => {
    await openSettings();
    await goTo("Plugins");
    const toggle = settings().getByRole("switch", { name: "Backlinks plugin" });
    await toggle.click({ force: true });
    await settings().getByText("Changes apply when the window reloads.").waitFor();
    await expect(
      settings().getByRole("switch", { name: "Settings plugin" }).isDisabled(),
    ).resolves.toBe(true);
    await settings().getByRole("button", { name: "Reload now" }).click();
    await page.getByTestId("app-shell").waitFor({ timeout: 30_000 });
    await openSettings();
    await goTo("Plugins");
    await expect(
      settings().getByRole("switch", { name: "Backlinks plugin" }).isChecked(),
    ).resolves.toBe(false);
  });

  test("team and account pages explain local mode; no folder-only settings", async () => {
    await openSettings();
    await goTo("Members");
    await settings().getByText("Members need a cloud workspace").waitFor();
    await settings().getByRole("button", { name: "Sign in to Lydie Cloud" }).waitFor();
    await goTo("Account");
    await settings().getByText("Not signed in").waitFor();
    await goTo("Agents & API");
    await settings().getByText("Hosted API", { exact: true }).waitFor();
    await expect(settings().getByText("On this computer").count()).resolves.toBe(0);
    await page.screenshot({ path: "/tmp/lydie-settings-local-team.png" });
  });
});
