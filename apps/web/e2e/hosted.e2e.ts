import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";

// Hosted mode against the live core: sign-up, the hand-off of local notes,
// two browsers syncing and editing together, offline edits, and team management and sharing.
// Self-contained: every test signs up its own users. Skipped with a message when the stack is down.
// Run: `bun run test:e2e:settings` (builds .e2e/settings first). BROWSER=firefox|webkit works.
import type { Browser, BrowserContext, Page } from "playwright";

import { activeEditor, activeTitle, browserType, launch, MOD, until } from "./helpers.ts";
import { startWebhookReceiver, startWordPress } from "./publishing-fakes.ts";
import { CORE_URL, coreIsUp, startSettingsServer } from "./settings-server.ts";
import type { SettingsServer } from "./settings-server.ts";

const up = await coreIsUp();
if (!up) console.warn(`[hosted.e2e] skipped: the hosted API at ${CORE_URL} is not running`);

let server: SettingsServer;
let browser: Browser;
const contexts: BrowserContext[] = [];

beforeAll(async () => {
  if (!up) return;
  server = await startSettingsServer();
  browser = await launch();
});

afterAll(async () => {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close();
  server?.stop();
});

const PASSWORD = "password1234";
let counter = 0;
export const uniqueEmail = (name: string) =>
  `${name}-${Date.now().toString(36)}-${(counter++).toString(36)}@example.com`;

// A page in the sidebar: the flat "Documents" tree of a local window, or a hosted window's
// grouped tree (Workspace and Private, or by teamspace).
function item(page: Page, title: string) {
  return page.getByRole("treeitem").filter({ hasText: title });
}

// Like helpers' createDoc, for both kinds of window.
async function createPage(page: Page, title: string, body?: string) {
  await page
    .getByRole("button", { name: /^New document/ })
    .first()
    .click();
  const field = activeTitle(page);
  await field.waitFor();
  await until(
    async () => await field.evaluate((el) => el === document.activeElement),
    3000,
    "title focus",
  );
  await field.pressSequentially(title, { delay: 10 });
  await page.keyboard.press("Enter");
  if (body) {
    await until(
      async () => await activeEditor(page).evaluate((el) => el.contains(document.activeElement)),
      3000,
      "editor focus",
    );
    await page.keyboard.type(body, { delay: 10 });
  }
  await item(page, title).first().waitFor();
}

async function resetLimits() {
  await fetch(`${CORE_URL}/dev/rate-limits/reset`, { method: "POST" }).catch(() => {});
}

async function newPage(): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`[page] ${error.message}`));
  // Confirmations (delete, revoke) are accepted.
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto(server.url);
  await page.getByTestId("app-shell").waitFor({ timeout: 30_000 });
  return page;
}

async function signInDialog(page: Page, email: string, mode: "sign-in" | "sign-up") {
  const dialog = page.getByRole("dialog", { name: /Sign in|Create an account/ });
  await dialog.waitFor();
  if (mode === "sign-up") await dialog.getByRole("button", { name: "Create an account" }).click();
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Password").fill(PASSWORD);
  await dialog
    .getByRole("button", { name: mode === "sign-up" ? "Create account" : "Sign in" })
    .click();
}

// Local notes → sign up → "Move to cloud" → the window reopens on the hosted copy.
async function signUpAndHandOff(page: Page, email: string) {
  await resetLimits();
  await page.getByRole("button", { name: "Sign in to Lydie Cloud" }).click();
  await signInDialog(page, email, "sign-up");
  const handoff = page.getByRole("dialog", { name: "Move to cloud" });
  await handoff.waitFor({ timeout: 15_000 });
  await handoff.getByRole("button", { name: "Continue" }).click();
  await page.getByTestId("handoff-summary").waitFor({ timeout: 20_000 });
  await handoff.getByRole("button", { name: /^Move \d+ page/ }).click();
  await page.getByTestId("handoff-done").waitFor({ timeout: 60_000 });
  await handoff.getByRole("button", { name: /^Open/ }).click();
  await waitForHosted(page);
}

async function waitForHosted(page: Page) {
  await page.getByTestId("app-shell").waitFor({ timeout: 30_000 });
  await page.getByTestId("sync-status").waitFor({ timeout: 30_000 });
}

async function waitSynced(page: Page, timeout = 30_000) {
  await until(
    async () => (await page.getByTestId("sync-status").getAttribute("data-state")) === "synced",
    timeout,
    "synced",
  );
}

// A second person (or device) signs in from a fresh browser and opens the workspace by name.
async function signInAndOpen(page: Page, email: string, workspaceName: string) {
  await resetLimits();
  await page.getByRole("button", { name: /^Workspace:/ }).click();
  await page.getByRole("button", { name: "Sign in…" }).click();
  await signInDialog(page, email, "sign-in");
  await page.getByRole("dialog", { name: /Sign in/ }).waitFor({ state: "detached" });
  await page.getByRole("button", { name: /^Workspace:/ }).click();
  await page
    .getByTestId("workspace-list")
    .getByRole("button")
    .filter({ hasText: workspaceName })
    .filter({ hasNotText: "This browser" })
    .first()
    .click();
  await waitForHosted(page);
}

// A new page in a hosted window: its body opens once the server has the page (about a second).
async function createHostedDoc(page: Page, title: string, body?: string) {
  await createPage(page, title);
  if (!body) return;
  await activeEditor(page).waitFor({ timeout: 30_000 });
  await typeInEditor(page, body);
}

async function typeInEditor(page: Page, text: string) {
  const editor = activeEditor(page);
  await editor.click();
  await page.keyboard.press(`${MOD}+End`);
  await page.keyboard.type(text, { delay: 5 });
}

describe.skipIf(!up)("hosted mode", () => {
  test("local notes are handed off, then sync to a second browser and converge both ways", async () => {
    const email = uniqueEmail("ada");
    const a = await newPage();
    await createPage(a, "Garden plan", "Tomatoes by the fence.");
    await a.waitForTimeout(600);
    await signUpAndHandOff(a, email);
    await item(a, "Garden plan").waitFor({ timeout: 30_000 });
    await waitSynced(a);
    await a.screenshot({ path: "/tmp/lydie-hosted-after-handoff.png" });

    // The same account in another browser sees the notes, bodies included.
    const b = await newPage();
    await signInAndOpen(b, email, "My notes");
    await item(b, "Garden plan").waitFor({ timeout: 30_000 });
    await item(b, "Garden plan").click();
    await activeEditor(b).getByText("Tomatoes by the fence.").waitFor({ timeout: 30_000 });

    // Edits converge both ways through collab.
    await item(a, "Garden plan").click();
    await activeEditor(a).getByText("Tomatoes by the fence.").waitFor({ timeout: 30_000 });
    await typeInEditor(a, " Basil from A.");
    await activeEditor(b).getByText("Basil from A.", { exact: false }).waitFor({ timeout: 20_000 });
    await typeInEditor(b, " Mint from B.");
    await activeEditor(a).getByText("Mint from B.", { exact: false }).waitFor({ timeout: 20_000 });
    await a.screenshot({ path: "/tmp/lydie-hosted-collab.png" });

    // A new page from B reaches A through the sync stream.
    await createHostedDoc(b, "Shed repairs");
    await item(a, "Shed repairs").waitFor({ timeout: 30_000 });

    // Offline: B keeps editing; it syncs after reconnecting. Playwright's offline mode does not cut
    // open WebSockets in Firefox and WebKit, so this part runs in Chromium.
    if (browserType().name() !== "chromium") return;
    await b.context().setOffline(true);
    await item(b, "Garden plan").click();
    await typeInEditor(b, " Written offline.");
    await b.waitForTimeout(1000);
    await expect(
      activeEditor(a).getByText("Written offline.", { exact: false }).count(),
    ).resolves.toBe(0);
    await b.context().setOffline(false);
    await activeEditor(a)
      .getByText("Written offline.", { exact: false })
      .waitFor({ timeout: 45_000 });
  });

  test("a page's URL names its workspace: it survives a reload and opens for someone signed out", async () => {
    const email = uniqueEmail("url");
    const a = await newPage();
    await createPage(a, "Garden plan", "Tomatoes by the fence.");
    await a.waitForTimeout(600);
    await signUpAndHandOff(a, email);
    await item(a, "Garden plan").click();
    await until(
      // The workspace by its slug, the page by its title and id.
      async () =>
        /^\/w\/my-notes[^/]*\/d\/garden-plan-[0-9a-f]{32}$/.test(new URL(a.url()).pathname),
      10_000,
      "a workspace URL",
    );
    const link = a.url();
    // "Copy link to page" gives that URL.
    const copied = await a.evaluate(async () => {
      let text = "";
      navigator.clipboard.writeText = async (value) => void (text = value);
      type App = { runCommand(id: string): Promise<void> };
      const { host } = (window as unknown as { __lydie: { host: { app: App } } }).__lydie;
      await host.app.runCommand("core.copyLink");
      return text;
    });
    expect(copied).toBe(link);
    await waitSynced(a);
    await a.reload();
    await waitForHosted(a);
    await activeEditor(a).getByText("Tomatoes by the fence.").waitFor({ timeout: 30_000 });
    expect(a.url()).toBe(link);

    // A fresh browser follows the link: sign in, and it is where the link said.
    await resetLimits();
    const b = await newPage();
    await b.goto(link);
    await signInDialog(b, email, "sign-in");
    await waitForHosted(b);
    await activeEditor(b).getByText("Tomatoes by the fence.").waitFor({ timeout: 30_000 });
    expect(b.url()).toBe(link);

    // A link to a workspace that is not theirs: the one opened last, and a word about it.
    const workspace = new URL(link).pathname.split("/").slice(0, 3).join("/");
    await b.goto(
      new URL(
        "/w/01973200-0000-0000-0000-000000000000/d/019340c0-0000-0000-0000-000000000000",
        link,
      ).href,
    );
    await waitForHosted(b);
    await b.getByText("That workspace is not one of yours").waitFor({ timeout: 10_000 });
    await until(async () => new URL(b.url()).pathname.startsWith(workspace), 10_000, "back home");
  });
});

describe.skipIf(!up)("new hosted pages", () => {
  test("are typeable at once and offline, and reach the server after reconnecting", async () => {
    const email = uniqueEmail("cy");
    const a = await newPage();
    await signUpAndHandOff(a, email);
    // Typed the moment the page exists (createDoc waits at most 3 s for the editor).
    await createPage(a, "Instant page", "Typed right away.");
    const b = await newPage();
    await signInAndOpen(b, email, "My notes");
    await item(b, "Instant page").click();
    await activeEditor(b).getByText("Typed right away.").waitFor({ timeout: 30_000 });

    if (browserType().name() !== "chromium") return;
    // Offline: create a page and write in it; nothing is lost when the connection returns.
    await a.context().setOffline(true);
    await createPage(a, "Offline page", "Written with no connection.");
    await a.waitForTimeout(1000);
    await expect(item(b, "Offline page").count()).resolves.toBe(0);
    await a.context().setOffline(false);
    await item(b, "Offline page").waitFor({ timeout: 45_000 });
    await item(b, "Offline page").click();
    await activeEditor(b).getByText("Written with no connection.").waitFor({ timeout: 45_000 });
    await a.screenshot({ path: "/tmp/lydie-hosted-offline-page.png" });
  });
});

// The invitation the core "sent" to `email` in development, from its dev outbox (newest first).
async function invitationToken(email: string): Promise<string | null> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await fetch(`${CORE_URL}/dev/outbox?to=${encodeURIComponent(email)}`).catch(
      () => null,
    );
    if (response?.ok) {
      const body = (await response.json()) as { messages?: { data?: { token?: string } }[] };
      const token = body.messages?.find((m) => m.data?.token)?.data?.token;
      if (token) return token;
    }
    await Bun.sleep(250);
  }
  return null;
}

async function openSettingsPage(page: Page, title: string) {
  const settings = page.getByRole("dialog", { name: "Settings" });
  if (!(await settings.isVisible())) {
    await page.keyboard.press(`${MOD}+Comma`);
    // Headless Chromium on macOS can keep Mod+, for itself: Linear's G then S opens it too,
    // outside a text field.
    if (
      !(await settings.waitFor({ timeout: 2000 }).then(
        () => true,
        () => false,
      ))
    ) {
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press("g");
      await page.keyboard.press("s");
    }
  }
  await settings.waitFor();
  await settings.getByRole("navigation").getByRole("button", { name: title, exact: true }).click();
  return settings;
}

async function closeSettings(page: Page) {
  const settings = page.getByRole("dialog", { name: "Settings" });
  if (await settings.isVisible()) {
    await settings.getByRole("button", { name: "Close settings" }).click();
    await settings.waitFor({ state: "detached" });
  }
}

// Accepts an invitation in a fresh browser: the invite page, a new account, then the workspace.
async function acceptInvitation(email: string): Promise<Page | null> {
  const token = await invitationToken(email);
  if (!token) return null;
  await resetLimits();
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto(new URL(`/invite?token=${token}`, server.url).toString());
  const card = page.getByTestId("invite-page");
  await card.getByLabel("Email").fill(email);
  await card.getByLabel("Password").fill(PASSWORD);
  await card.getByRole("button", { name: "Create account" }).click();
  await card.getByRole("heading", { name: /^Join / }).waitFor({ timeout: 30_000 });
  await page.screenshot({ path: "/tmp/lydie-team-invite-page.png" });
  await card.getByRole("button", { name: "Accept invitation" }).click();
  await waitForHosted(page);
  return page;
}

async function newTeamspace(
  page: Page,
  settings: ReturnType<Page["getByRole"]>,
  name: string,
  visibility: "Open" | "Closed" | "Private",
) {
  await settings.getByRole("button", { name: "New teamspace" }).click();
  const create = page.getByRole("dialog", { name: "New teamspace" });
  await create.getByLabel("Name").fill(name);
  await create.getByRole("button", { name: /Visibility/ }).click();
  await page.getByRole("option", { name: visibility }).click();
  await create.getByRole("button", { name: "Create teamspace" }).click();
  await settings
    .getByTestId("teamspaces")
    .getByRole("button", { name })
    .waitFor({ timeout: 20_000 });
  // Creating opens its details; close them.
  const details = settings.getByTestId("settings-details");
  if (await details.isVisible())
    await details.getByRole("button", { name: "Close details" }).click();
}

// A page's tree in one sidebar section ("Workspace", "Private", a teamspace's name).
function inSection(page: Page, section: string, title: string) {
  return page
    .getByRole("region", { name: section, exact: true })
    .getByRole("treeitem")
    .filter({ hasText: title });
}

// "Move to Workspace or Private…" from the page's context menu, to the space the dialog offers
// first: one the page is not in.
async function moveToOtherSection(page: Page, title: string) {
  await item(page, title).first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to Workspace or Private…" }).click();
  const dialog = page.getByRole("dialog", { name: "Move to Workspace or Private" });
  await dialog.getByRole("radio").first().waitFor();
  await dialog.getByRole("button", { name: "Move" }).click();
  await dialog.waitFor({ state: "detached" });
}

async function openShare(page: Page, title: string) {
  await item(page, title).first().click();
  await page.getByTestId("share-bar").getByRole("button", { name: "Share" }).click();
  const dialog = page.getByRole("dialog", { name: `Share ${title}` });
  await dialog.waitFor();
  await dialog.getByTestId("share-people").waitFor({ timeout: 20_000 });
  return dialog;
}

describe.skipIf(!up)("team and sharing", () => {
  test("invite and accept, roles, Workspace and Private, a guest share, a public link and revoked access", async () => {
    const ada = uniqueEmail("ada");
    const bob = uniqueEmail("bob");
    const gus = uniqueEmail("gus");
    const a = await newPage();
    await createPage(a, "Roadmap", "Ship the team features.");
    await a.waitForTimeout(500);
    await signUpAndHandOff(a, ada);
    await item(a, "Roadmap").waitFor({ timeout: 30_000 });

    // Teamspaces are hidden: no settings page for them, and no teamspace picker when inviting Bob.
    const settings = await openSettingsPage(a, "Members");
    await expect(
      settings.getByRole("navigation").getByRole("button", { name: "Teamspaces" }).count(),
    ).resolves.toBe(0);
    await settings.getByTestId("members").getByText("(you)").waitFor({ timeout: 20_000 });
    await settings.getByRole("button", { name: "Invite people" }).click();
    const invite = a.getByRole("dialog", { name: "Invite people" });
    await invite.getByLabel("Email addresses").fill(bob);
    await expect(invite.getByRole("checkbox").count()).resolves.toBe(0);
    await invite.getByRole("button", { name: "Send invitations" }).click();
    await settings.getByTestId("invitations").getByText(bob).waitFor({ timeout: 20_000 });
    await a.screenshot({ path: "/tmp/lydie-team-members.png" });

    const b = await acceptInvitation(bob);
    if (!b) {
      console.warn("[hosted.e2e] invitation steps skipped: the dev outbox has no invitation");
      return;
    }
    // Bob is in: the hand-off put Ada's pages in the default teamspace, the Workspace section.
    await inSection(b, "Workspace", "Roadmap").waitFor({ timeout: 30_000 });

    // The open Members page follows without a reload (LYD-420): Bob's synced membership
    // refetches the lists, so his invitation leaves and he joins the members.
    await settings
      .getByTestId("invitations")
      .getByText(bob)
      .waitFor({ state: "detached", timeout: 20_000 });
    // Ada makes Bob an admin.
    await settings
      .getByTestId("members")
      .getByRole("button", { name: new RegExp(`^${bob.split("@")[0]}`) })
      .click();
    const details = settings.getByTestId("settings-details");
    await details.getByRole("button", { name: /Role/ }).click();
    await a.getByRole("option", { name: "Admin" }).click();
    await settings.getByTestId("members").getByText("Admin").waitFor({ timeout: 20_000 });
    // Escape closes the details panel first, then the settings.
    await a.getByRole("listbox").waitFor({ state: "detached" });
    await a.keyboard.press("Escape");
    await details.waitFor({ state: "detached" });
    await expect(settings.isVisible()).resolves.toBe(true);

    await closeSettings(a);

    // The sidebar has two sections: the handed-off page in Workspace, a new one in Private.
    await createHostedDoc(a, "Guest brief", "Only for Gus.");
    await inSection(a, "Workspace", "Roadmap").waitFor({ timeout: 20_000 });
    await inSection(a, "Private", "Guest brief").waitFor({ timeout: 20_000 });
    await a.screenshot({ path: "/tmp/lydie-team-spaces-tree.png" });
    // Moved to Workspace, Bob sees it; moved back to Private, he does not.
    await a.waitForTimeout(1500);
    await moveToOtherSection(a, "Guest brief");
    await inSection(a, "Workspace", "Guest brief").waitFor({ timeout: 20_000 });
    await inSection(b, "Workspace", "Guest brief").waitFor({ timeout: 30_000 });
    await moveToOtherSection(a, "Guest brief");
    await inSection(a, "Private", "Guest brief").waitFor({ timeout: 20_000 });
    await item(b, "Guest brief").waitFor({ state: "detached", timeout: 30_000 });

    // A private page shared with a guest, who sees only that page.
    let share = await openShare(a, "Guest brief");
    // Members are suggested by any word of their name or email as you type (LYD-421).
    const field = share.getByRole("combobox", { name: "Add people or emails" });
    await field.fill("bob");
    await share.getByRole("option", { name: /bob/i }).waitFor({ timeout: 20_000 });
    await field.press("ArrowDown");
    await field.press("Enter");
    await share
      .getByTestId("share-grants")
      .getByRole("listitem")
      .filter({ hasText: /bob/i })
      .waitFor({ timeout: 20_000 });
    await field.fill(gus);
    await share.getByRole("button", { name: "Invite" }).click();
    await a.getByText(`Invitation sent to ${gus}`).waitFor({ timeout: 20_000 });
    await share.getByRole("button", { name: "Done" }).click();
    const g = await acceptInvitation(gus);
    expect(g).not.toBeNull();
    await item(g!, "Guest brief").waitFor({ timeout: 30_000 });
    await expect(item(g!, "Roadmap").count()).resolves.toBe(0);
    await item(g!, "Guest brief").click();
    await activeEditor(g!).getByText("Only for Gus.").waitFor({ timeout: 30_000 });

    // A public link with a password.
    share = await openShare(a, "Guest brief");
    await share.getByRole("button", { name: "Publish to web" }).click();
    await share.getByLabel("Password (optional)").fill("hunter22");
    await share.getByRole("button", { name: "Create link" }).click();
    const url = await share.getByRole("textbox", { name: "Public link" }).inputValue();
    expect(url).toContain("/s/");
    await a.screenshot({ path: "/tmp/lydie-sharing-dialog.png" });
    const anon = await (async () => {
      const context = await browser.newContext();
      contexts.push(context);
      return context.newPage();
    })();
    await anon.goto(url);
    await anon
      .getByRole("heading", { name: "This page is protected" })
      .waitFor({ timeout: 20_000 });
    await anon.getByLabel("Password").fill("wrong");
    await anon.getByRole("button", { name: "Open page" }).click();
    await anon.getByText("That password is not right.").waitFor();
    await anon.getByLabel("Password").fill("hunter22");
    await anon.getByRole("button", { name: "Open page" }).click();
    await anon.getByTestId("public-page").getByText("Only for Gus.").waitFor({ timeout: 20_000 });
    await anon.screenshot({ path: "/tmp/lydie-sharing-public.png" });

    // Ada removes Gus's access: his open page closes.
    const gusRow = share
      .getByTestId("share-grants")
      .getByRole("listitem")
      .filter({ hasText: gus.split("@")[0]! });
    await gusRow.getByRole("button").click();
    await a.getByRole("option", { name: "Remove" }).click();
    await gusRow.waitFor({ state: "detached", timeout: 20_000 });
    await g!
      .getByText(/You no longer have access to this page|This document does not exist/)
      .first()
      .waitFor({ timeout: 45_000 });
    await g!.screenshot({ path: "/tmp/lydie-sharing-revoked.png" });
  });
});

describe.skipIf(!up)("teamspaces", () => {
  test("a workspace with another teamspace shows them all, until it is gone", async () => {
    const email = uniqueEmail("spaces");
    const ada = await apiUser(email);
    const ws = await ada.call<{ id: string }>("POST", "/v1/workspaces", { name: "Studio" });
    // Made through the API, as before teamspaces were hidden.
    const design = await ada.call<{ id: string }>("POST", `/v1/workspaces/${ws.id}/teamspaces`, {
      name: "Design",
      visibility: "closed",
    });
    await ada.call("POST", "/v1/documents", {
      workspaceId: ws.id,
      teamspaceId: design.id,
      title: "Mockups",
    });
    const a = await newPage();
    await signInAndOpen(a, email, "Studio");

    // Each teamspace is a section by its name, the default one included.
    await inSection(a, "Design", "Mockups").waitFor({ timeout: 30_000 });
    await a.getByRole("region", { name: "General", exact: true }).waitFor();
    await expect(a.getByRole("region", { name: "Workspace", exact: true }).count()).resolves.toBe(
      0,
    );
    await item(a, "Mockups").first().click({ button: "right" });
    await a.getByRole("menuitem", { name: "Move to teamspace…" }).waitFor();
    await a.keyboard.press("Escape");

    // Settings → Teamspaces: a new one, deleted and restored.
    let settings = await openSettingsPage(a, "Teamspaces");
    await settings
      .getByTestId("teamspaces")
      .getByRole("button", { name: "Design" })
      .waitFor({ timeout: 20_000 });
    await newTeamspace(a, settings, "Research", "Open");
    await a.screenshot({ path: "/tmp/lydie-team-teamspaces.png" });
    await settings.getByTestId("teamspaces").getByRole("button", { name: "Research" }).click();
    await settings.getByTestId("settings-details").getByRole("button", { name: "Delete" }).click();
    await a.getByRole("button", { name: "Delete teamspace" }).click();
    const deleted = settings.getByTestId("deleted-teamspaces");
    await deleted.getByText("Research").waitFor({ timeout: 20_000 });
    await deleted.getByRole("button", { name: "Restore Research" }).click();
    await settings
      .getByTestId("teamspaces")
      .getByRole("button", { name: "Research" })
      .waitFor({ timeout: 20_000 });

    // Invitations offer the other teamspaces.
    settings = await openSettingsPage(a, "Members");
    await settings.getByRole("button", { name: "Invite people" }).click();
    const invite = a.getByRole("dialog", { name: "Invite people" });
    await invite.getByRole("checkbox", { name: "Design" }).waitFor();
    await invite.getByRole("button", { name: "Cancel" }).click();
    await closeSettings(a);

    // Without them the workspace has one shared section again.
    const { teamspaces } = await ada.call<{ teamspaces: { id: string; isDefault: boolean }[] }>(
      "GET",
      `/v1/workspaces/${ws.id}/teamspaces`,
    );
    for (const t of teamspaces.filter((t) => !t.isDefault)) {
      await ada.call("DELETE", `/v1/teamspaces/${t.id}`);
    }
    await a.getByRole("region", { name: "Workspace", exact: true }).waitFor({ timeout: 30_000 });
    await item(a, "Mockups").waitFor({ state: "detached", timeout: 30_000 });
    await expect(a.getByRole("region", { name: "General", exact: true }).count()).resolves.toBe(0);
  });
});

describe.skipIf(!up)("hosted states", () => {
  test("an ended session keeps changes and resumes after signing in again", async () => {
    const email = uniqueEmail("exp");
    const ada = await apiUser(email);
    const ws = await ada.call<{ id: string }>("POST", "/v1/workspaces", { name: "Expiry" });
    const spaces = await ada.call<{ teamspaces: { id: string; isDefault: boolean }[] }>(
      "GET",
      `/v1/workspaces/${ws.id}/teamspaces`,
    );
    const general = spaces.teamspaces.find((t) => t.isDefault)!;
    const doc = await ada.call<{ id: string }>("POST", "/v1/documents", {
      workspaceId: ws.id,
      teamspaceId: general.id,
      title: "Draft",
      markdown: "First line.\n",
    });
    const a = await newPage();
    await signInAndOpen(a, email, "Expiry");
    await item(a, "Draft").first().click();
    const editor = a.locator(`[data-testid=doc-view][data-doc-id="${doc.id}"] [data-doc-content]`);
    await editor.waitFor({ timeout: 30_000 });

    // The session ends on the server (signed out elsewhere, expired).
    const stored = await a.evaluate(
      () =>
        Object.entries(localStorage).find(([k]) => k.startsWith("lydie:secret:lydie.session"))?.[1],
    );
    const token = (JSON.parse(stored!) as { token: string }).token;
    await fetch(`${CORE_URL}/auth/sign-out`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: "{}",
    });
    await editor.click();
    await a.keyboard.press(`${MOD}+End`);
    await a.keyboard.type(" Typed after it ended.", { delay: 5 });
    await createPage(a, "Made while signed out");
    const fresh = await a
      .locator("[data-testid=tab-view][data-focused] [data-testid=doc-view]")
      .getAttribute("data-doc-id");
    const banner = a.getByRole("status").filter({ hasText: "Your session ended" });
    await banner.waitFor({ timeout: 30_000 });
    const onServer = async () =>
      (
        await fetch(`${CORE_URL}/v1/documents/${fresh}`, {
          headers: { authorization: `Bearer ${ada.token}` },
        })
      ).status;
    expect(await onServer()).toBe(404);
    await a.screenshot({ path: "/tmp/lydie-hosted-session-ended.png" });

    await resetLimits();
    await banner.getByRole("button", { name: "Sign in" }).click();
    const dialog = a.getByRole("dialog", { name: /Sign in/ });
    // The email of the ended session is filled in.
    expect(await dialog.getByLabel("Email").inputValue()).toBe(email);
    await dialog.getByLabel("Password").fill(PASSWORD);
    await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
    await banner.waitFor({ state: "detached", timeout: 30_000 });
    await until(async () => (await onServer()) === 200, 60_000, "the page made while signed out");
    await until(
      async () => {
        const body = await ada.call<{ body: { markdown: string } | null }>(
          "GET",
          `/v1/documents/${doc.id}?includeBody=true`,
        );
        return body.body?.markdown.includes("Typed after it ended.") ?? false;
      },
      60_000,
      "the text typed while signed out",
    );
  });

  test("removed from the workspace while it is open", async () => {
    const ada = await apiUser(uniqueEmail("ada"));
    const bobEmail = uniqueEmail("bob");
    const ws = await ada.call<{ id: string }>("POST", "/v1/workspaces", { name: "Shared" });
    await ada.call("POST", `/v1/workspaces/${ws.id}/invitations`, { email: bobEmail });
    const b = await acceptInvitation(bobEmail);
    expect(b).not.toBeNull();
    const members = await ada.call<{ members: { userId: string; email: string }[] }>(
      "GET",
      `/v1/workspaces/${ws.id}/members`,
    );
    const bobId = members.members.find((m) => m.email === bobEmail)!.userId;
    await ada.call("DELETE", `/v1/workspaces/${ws.id}/members/${bobId}`);
    // Checked when the window gets focus again (and every minute).
    await b!.evaluate(() => window.dispatchEvent(new Event("focus")));
    const banner = b!.getByRole("alert").filter({ hasText: "You no longer have access to Shared" });
    await banner.waitFor({ timeout: 20_000 });
    await b!.screenshot({ path: "/tmp/lydie-hosted-removed.png" });
    // Bob has no other workspace: the way out is this device's own notes.
    await banner.getByRole("button", { name: "Open this device's notes" }).click();
    await b!
      .getByRole("button", { name: /^Workspace: / })
      .filter({ hasNotText: "Shared" })
      .waitFor({
        timeout: 30_000,
      });
  });
});

describe.skipIf(!up)("publishing", () => {
  const destinations: { stop(): void }[] = [];
  afterAll(() => {
    for (const d of destinations) d.stop();
  });

  async function openPanel(page: Page, title: string) {
    await item(page, title).first().click();
    await page.keyboard.press(`${MOD}+K`);
    await page.getByRole("combobox").fill("Publish this document");
    await page.keyboard.press("Enter");
    const panel = page.getByTestId("publish-panel");
    await panel.waitFor({ timeout: 10_000 });
    return panel;
  }

  // Types at the end of the open document (its editor, wherever focus is, e.g. in the panel).
  async function appendToDoc(page: Page, text: string) {
    const editor = page.locator("[data-testid=doc-view] [data-doc-content]").first();
    await editor.waitFor({ timeout: 30_000 });
    await editor.click();
    await page.keyboard.press(`${MOD}+End`);
    await page.keyboard.type(text, { delay: 5 });
  }

  async function stateIs(panel: ReturnType<Page["getByTestId"]>, text: string, timeout = 60_000) {
    const state = panel.getByTestId("publication-state");
    await until(async () => (await state.textContent()) === text, timeout, `state "${text}"`);
  }

  async function removeConnection(page: Page, name: string) {
    const settings = await openSettingsPage(page, "Publishing");
    await settings.getByTestId("connections").getByText(name, { exact: true }).click();
    await settings.getByRole("button", { name: "Remove", exact: true }).click();
    await settings.getByText("Nothing connected yet.").waitFor({ timeout: 15_000 });
    await closeSettings(page);
  }

  test("webhook: connect, publish, log, edit, publish now, auto-publish, unpublish, remove", async () => {
    const receiver = startWebhookReceiver();
    destinations.push(receiver);
    const a = await newPage();
    await createPage(a, "Release notes", "Version 2 is out.");
    await a.waitForTimeout(500);
    await signUpAndHandOff(a, uniqueEmail("pub"));
    await item(a, "Release notes").waitFor({ timeout: 30_000 });

    const settings = await openSettingsPage(a, "Publishing");
    await settings.getByText("Nothing connected yet.").waitFor({ timeout: 15_000 });
    await settings.getByRole("button", { name: "Connect Webhook" }).click();
    const connect = a.getByRole("dialog", { name: "Connect Webhook" });
    // The form is built from the connector's schema and checks it before sending.
    await connect.getByRole("button", { name: "Connect" }).click();
    await connect.getByText("Required").waitFor();
    await connect.getByLabel("URL").fill("not a url");
    await connect.getByRole("button", { name: "Connect" }).click();
    await connect.getByText(/Enter a full URL/).waitFor();
    await connect.getByLabel("URL").fill(receiver.url);
    await connect.getByRole("button", { name: "Connect" }).click();
    const revealed = settings.getByRole("status").filter({ hasText: "Copy the secret now" });
    await revealed.waitFor({ timeout: 20_000 });
    const secret = await revealed.getByLabel("secret").inputValue();
    expect(secret).toMatch(/^whsec_/);
    receiver.setSecret(secret);
    await a.screenshot({ path: "/tmp/lydie-publishing-connections.png" });
    await revealed.getByRole("button", { name: "I have copied it" }).click();
    await revealed.waitFor({ state: "detached" });
    await settings.getByTestId("connections").getByText("Webhook").first().waitFor();
    await closeSettings(a);

    const panel = await openPanel(a, "Release notes");
    await panel.getByText("This document is not published anywhere.").waitFor();
    await panel.getByRole("button", { name: "Publish to…" }).click();
    await panel.getByRole("button", { name: "Publish", exact: true }).click();
    await stateIs(panel, "Published");
    const published = receiver.deliveries.find((d) => d.type === "publication.published");
    expect(published?.verified).toBe(true);
    expect(String(published?.data.markdown)).toContain("Version 2 is out.");
    await panel.getByRole("button", { name: "Log" }).click();
    const log = panel.getByRole("list", { name: "Publish log" });
    await log
      .getByText(/publish · Done/)
      .first()
      .waitFor();

    // An edit, published by hand.
    await appendToDoc(a, " Now with folders.");
    // The server marks it on its next sweep (every 30 s here).
    await stateIs(panel, "Changed since it was published", 90_000);
    await panel.getByRole("button", { name: "Publish now" }).click();
    await until(
      async () =>
        receiver.deliveries.some(
          (d) => d.type === "publication.updated" && String(d.data.markdown).includes("folders"),
        ),
      60_000,
      "the update delivered",
    );
    await stateIs(panel, "Published");
    await until(async () => (await log.getByText(/publish · Done/).count()) >= 2, 15_000, "log");

    // Changes publish themselves once auto-publish is on (after the server's debounce).
    // Its visible label, as a person clicks it (a forced click on the hidden input can land on
    // another button).
    await panel.getByText("Publish changes automatically").click();
    // The switch's label carries its state (WebKit does not report the input as checked).
    await until(
      async () =>
        (await panel
          .locator("label")
          .filter({ hasText: "Publish changes automatically" })
          .getAttribute("data-selected")) === "true",
      10_000,
      "auto-publish on",
    );
    await appendToDoc(a, " And tags.");
    await until(
      async () =>
        receiver.deliveries.some(
          (d) => d.type === "publication.updated" && String(d.data.markdown).includes("And tags."),
        ),
      180_000,
      "the automatic update",
    );
    await stateIs(panel, "Published");
    expect(receiver.deliveries.every((d) => d.verified)).toBe(true);
    await a.screenshot({ path: "/tmp/lydie-publishing-panel.png" });

    await panel.getByRole("button", { name: "Unpublish" }).click();
    await stateIs(panel, "Unpublished");
    expect(receiver.deliveries.at(-1)?.type).toBe("publication.unpublished");

    await removeConnection(a, "Webhook");
    await openPanel(a, "Release notes");
    await panel.getByText("This document is not published anywhere.").waitFor({ timeout: 15_000 });
  });

  test("WordPress: connect form, a changed copy and its choices, a failing test, unpublish", async () => {
    const wp = startWordPress({ username: "editor", password: "abcd efgh ijkl mnop" });
    destinations.push(wp);
    const a = await newPage();
    await createPage(a, "Garden diary", "Tomatoes are ripe.");
    await a.waitForTimeout(500);
    await signUpAndHandOff(a, uniqueEmail("wp"));
    await item(a, "Garden diary").waitFor({ timeout: 30_000 });

    const settings = await openSettingsPage(a, "Publishing");
    await settings.getByRole("button", { name: "Connect WordPress" }).click();
    const connect = a.getByRole("dialog", { name: "Connect WordPress" });
    await connect.getByRole("button", { name: "Connect" }).click();
    expect(await connect.getByText("Required").count()).toBeGreaterThanOrEqual(3);
    await connect.getByLabel("Username").fill("editor");
    await connect.getByLabel("Application password").fill("short");
    await connect.getByLabel("Site URL").fill("blog");
    await connect.getByRole("button", { name: "Connect" }).click();
    await connect.getByText("At least 8 characters").waitFor();
    await connect.getByText(/Enter a full URL/).waitFor();
    // The site refuses the password: shown in the dialog, nothing connected.
    await connect.getByLabel("Application password").fill("wrong password here");
    await connect.getByLabel("Site URL").fill(wp.siteUrl);
    await connect.getByRole("button", { name: "Connect" }).click();
    await connect.getByRole("alert").waitFor({ timeout: 20_000 });
    expect(await connect.getByRole("alert").innerText()).toMatch(/password/i);
    await a.screenshot({ path: "/tmp/lydie-publishing-wordpress-refused.png" });
    await connect.getByLabel("Application password").fill("abcd efgh ijkl mnop");
    await connect.getByRole("button", { name: "Connect" }).click();
    await connect.waitFor({ state: "detached", timeout: 20_000 });
    const row = settings.getByTestId("connections").getByText("WordPress", { exact: true });
    await row.waitFor();
    await settings
      .getByTestId("connections")
      .getByText(/editor/)
      .waitFor();
    await closeSettings(a);

    const panel = await openPanel(a, "Garden diary");
    await panel.getByRole("button", { name: "Publish to…" }).click();
    await panel.getByRole("button", { name: /Status/ }).click();
    await a.getByRole("option", { name: "publish", exact: true }).click();
    await panel.getByRole("button", { name: "Publish", exact: true }).click();
    await stateIs(panel, "Published");
    const post = [...wp.posts.values()][0]!;
    expect(post.status).toBe("publish");
    expect(post.content).toContain("Tomatoes are ripe.");
    await panel.getByRole("link", { name: /127\.0\.0\.1/ }).waitFor();

    // Someone edits the post in WordPress: the next publish stops and asks.
    const diverge = async (line: string) => {
      wp.edit(post.id, (p) => {
        p.content += `\n<!-- wp:paragraph -->\n<p>${line}</p>\n<!-- /wp:paragraph -->`;
      });
      await panel.getByRole("button", { name: "Publish now" }).click();
      await stateIs(panel, "Changed at the destination");
      const prompt = panel.getByTestId("publication-diverged");
      // Their lines, or the merge with conflict markers when the edits overlap.
      await prompt.getByText(line).first().waitFor();
      // WordPress edits cannot be pulled into the document.
      expect(await prompt.getByRole("button", { name: "Pull theirs in here" }).count()).toBe(0);
      return prompt;
    };
    let prompt = await diverge("Edited in WordPress.");
    await a.screenshot({ path: "/tmp/lydie-publishing-diverged.png" });
    await prompt.getByRole("button", { name: "Keep theirs" }).click();
    await stateIs(panel, "Published");
    expect(post.content).toContain("Edited in WordPress.");

    prompt = await diverge("Edited there again.");
    await prompt.getByRole("button", { name: "Overwrite with this" }).click();
    await stateIs(panel, "Published");
    await until(
      async () => !post.content.includes("Edited there again."),
      15_000,
      "the post overwritten",
    );
    expect(post.content).toContain("Tomatoes are ripe.");

    // The password is revoked in WordPress: Test connection says so.
    wp.setPassword("revoked in wordpress");
    const details = await openSettingsPage(a, "Publishing");
    await details.getByTestId("connections").getByText("WordPress", { exact: true }).click();
    await details.getByRole("button", { name: "Test connection" }).click();
    await details
      .getByText(/password/i)
      .first()
      .waitFor({ timeout: 20_000 });
    await details.getByText("Not working").first().waitFor({ timeout: 10_000 });
    await a.screenshot({ path: "/tmp/lydie-publishing-test-failed.png" });
    wp.setPassword("abcd efgh ijkl mnop");
    await details.getByRole("button", { name: "Test connection" }).click();
    await details.getByText("Connected as editor").waitFor({ timeout: 20_000 });
    await closeSettings(a);

    await openPanel(a, "Garden diary");
    await panel.getByRole("button", { name: "Unpublish" }).click();
    await stateIs(panel, "Unpublished");
    expect(post.status).toBe("draft");
    await removeConnection(a, "WordPress");
  });

  test("GitHub: the connect form checks its fields; a refused token is shown", async () => {
    // A GitHub API that refuses every token (the repository check itself goes to github.com).
    const github = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () =>
        Response.json(
          { message: "Bad credentials", documentation_url: "https://docs.github.com/rest" },
          { status: 401 },
        ),
    });
    destinations.push({ stop: () => void github.stop(true) });
    const a = await newPage();
    await resetLimits();
    await a.getByRole("button", { name: "Sign in to Lydie Cloud" }).click();
    await signInDialog(a, uniqueEmail("gh"), "sign-up");
    const handoff = a.getByRole("dialog", { name: "Move to cloud" });
    await handoff.waitFor({ timeout: 15_000 });
    await handoff.getByRole("button", { name: "Continue" }).click();
    await a.getByTestId("handoff-summary").waitFor({ timeout: 20_000 });
    await handoff.getByRole("button", { name: /^Move \d+ page/ }).click();
    await a.getByTestId("handoff-done").waitFor({ timeout: 60_000 });
    await handoff.getByRole("button", { name: /^Open/ }).click();
    await waitForHosted(a);

    const settings = await openSettingsPage(a, "Publishing");
    await settings.getByRole("button", { name: "Connect GitHub" }).click();
    const connect = a.getByRole("dialog", { name: "Connect GitHub" });
    // Only the token is offered when the server has no GitHub app configured.
    expect(await connect.getByRole("radio", { name: "Sign in with GitHub" }).count()).toBe(0);
    await connect.getByRole("button", { name: "Connect" }).click();
    await connect.getByText("Required").first().waitFor();
    await connect.getByLabel("Token").fill("ghp_notarealtoken");
    await connect.getByLabel("Repository").fill("not a repository");
    await connect.getByRole("button", { name: "Connect" }).click();
    await connect
      .getByText(/owner\/name/)
      .first()
      .waitFor();
    await connect.getByLabel("Repository").fill("lydie/notes");
    await connect.getByLabel("API URL").fill(`http://127.0.0.1:${github.port}`);
    await connect.getByRole("button", { name: "Connect" }).click();
    await connect.getByRole("alert").waitFor({ timeout: 20_000 });
    // The server checks the repository with git; its refusal is shown in the dialog.
    expect(await connect.getByRole("alert").innerText()).toMatch(/GitHub refused the connection/);
    await a.screenshot({ path: "/tmp/lydie-publishing-github-refused.png" });
    await connect.getByRole("button", { name: "Cancel" }).click();
    await settings.getByText("Nothing connected yet.").waitFor();
  });
});

// A user driven through the API (dev route): token, workspace and its default teamspace.
async function apiUser(email: string) {
  await resetLimits();
  const { token } = (await (
    await fetch(`${CORE_URL}/dev/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD, name: email.split("@")[0] }),
    })
  ).json()) as { token: string };
  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${CORE_URL}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok)
      throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
    return (await response.json()) as T;
  };
  return { token, call };
}

// RFC 6238 (SHA-1, six digits, 30 s) from the setup key the dialog shows (base32).
function totpCode(key: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of key.replace(/\s+/g, "").toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  }
  const secret = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const digest = createHmac("sha1", secret).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

describe.skipIf(!up)("account security", () => {
  test("two-step verification: turned on, asked for at sign-in, and a device signed out", async () => {
    const email = uniqueEmail("twofa");
    const a = await newPage();
    await signUpAndHandOff(a, email);
    let settings = await openSettingsPage(a, "Account");
    await settings.getByTestId("two-factor-status").filter({ hasText: "off" }).waitFor();
    await settings.getByRole("button", { name: "Turn on…" }).click();
    const setup = a.getByRole("dialog", { name: "Turn on two-step verification" });
    await setup.getByLabel("Password").fill(PASSWORD);
    await setup.getByRole("button", { name: "Continue" }).click();
    await setup.getByRole("img", { name: "QR code for your authenticator app" }).waitFor();
    const key = (await setup.getByTestId("two-factor-key").textContent()) ?? "";
    await setup.getByLabel("Code from the app").fill("000000");
    await setup.getByRole("button", { name: "Turn on" }).click();
    await setup.getByRole("alert").filter({ hasText: "code is not right" }).waitFor();
    await setup.getByLabel("Code from the app").fill(totpCode(key));
    await setup.getByRole("button", { name: "Turn on" }).click();
    const codes = setup.getByRole("list", { name: "Backup codes" });
    await codes.waitFor();
    const backup = (await codes.getByRole("listitem").allTextContents()).map((c) => c.trim());
    expect(backup.length).toBeGreaterThanOrEqual(10);
    await a.screenshot({ path: "/tmp/lydie-two-factor-codes.png" });
    await setup.getByRole("button", { name: "I have saved them" }).click();
    await setup.waitFor({ state: "detached" });
    await settings.getByTestId("two-factor-status").filter({ hasText: "on" }).waitFor();
    // Turning it on replaced this window's session: it still syncs.
    await closeSettings(a);
    await createHostedDoc(a, "After two-step", "still syncing");
    await waitSynced(a);

    // Another browser: the password, then a backup code.
    await resetLimits();
    const b = await newPage();
    await b.getByRole("button", { name: /^Workspace:/ }).click();
    await b.getByRole("button", { name: "Sign in…" }).click();
    await signInDialog(b, email, "sign-in");
    const verify = b.getByRole("dialog", { name: "Two-step verification" });
    await verify.getByLabel("Code").waitFor();
    await b.screenshot({ path: "/tmp/lydie-two-factor-sign-in.png" });
    await verify.getByRole("button", { name: "Use a backup code" }).click();
    await verify.getByLabel("Backup code").fill(backup[0]!);
    await verify.getByRole("button", { name: "Verify" }).click();
    await verify.waitFor({ state: "detached" });
    await b.getByRole("button", { name: /^Workspace:/ }).click();
    await b
      .getByTestId("workspace-list")
      .getByRole("button")
      .filter({ hasText: "My notes" })
      .filter({ hasNotText: "This browser" })
      .first()
      .click();
    await waitForHosted(b);
    await item(b, "After two-step").first().waitFor({ timeout: 30_000 });

    // The first browser lists both and signs the other one out.
    await closeSettings(a);
    settings = await openSettingsPage(a, "Account");
    const devices = settings.getByTestId("signed-in-device");
    await until(async () => (await devices.count()) === 2, 10_000, "two devices");
    await devices.filter({ hasText: "This device" }).waitFor();
    await a.screenshot({ path: "/tmp/lydie-signed-in-devices.png" });
    await settings.getByRole("button", { name: /^Sign out Chrome on / }).click();
    await a.getByRole("alertdialog").getByRole("button", { name: "Sign out" }).click();
    await until(async () => (await devices.count()) === 1, 10_000, "one device");
    await b.reload();
    await b
      .getByText("Your session ended. Changes are kept on this device until you sign in again.")
      .waitFor({ timeout: 30_000 });

    // Turning it off: a sign-in needs only the password again.
    await settings.getByRole("button", { name: "Turn off…" }).click();
    const off = a.getByRole("dialog", { name: "Turn off two-step verification" });
    await off.getByLabel("Password").fill(PASSWORD);
    await off.getByRole("button", { name: "Turn off" }).click();
    await off.waitFor({ state: "detached" });
    await settings.getByTestId("two-factor-status").filter({ hasText: "off" }).waitFor();
  });
});

describe.skipIf(!up)("API tokens", () => {
  test("an API token works until it is revoked", async () => {
    const a = await newPage();
    await signUpAndHandOff(a, uniqueEmail("tok"));
    const settings = await openSettingsPage(a, "Agents & API");
    await settings.getByLabel("New token").fill("CI script");
    await settings.getByRole("button", { name: "Create token" }).click();
    const secret = await settings.getByText(/^lyd_pat_[A-Za-z0-9_-]{30,}$/).textContent();
    expect(secret?.length).toBeGreaterThan(10);
    // The hosted MCP snippets fill in the new token.
    await settings.getByRole("radio", { name: "API token" }).click({ force: true });
    expect(await settings.getByTestId("mcp-snippet").innerText()).toContain(`Bearer ${secret}`);
    await a.screenshot({ path: "/tmp/lydie-settings-api-tokens.png" });
    const asToken = () =>
      fetch(`${CORE_URL}/v1/workspaces`, { headers: { authorization: `Bearer ${secret}` } });
    expect((await asToken()).status).toBe(200);
    await settings.getByRole("button", { name: "I have copied it" }).click();
    await settings.getByRole("button", { name: "Revoke CI script" }).click();
    await a.getByRole("alertdialog").getByRole("button", { name: "Revoke" }).click();
    await settings.getByRole("button", { name: "Revoke CI script" }).waitFor({ state: "detached" });
    await until(async () => (await asToken()).status === 401, 10_000, "token revoked");
  });
});

// An MCP client as an agent would be: registers, sends the person through authorize and the
// consent page (PKCE), trades the code for a token, and calls the hosted MCP server.
describe.skipIf(!up)("hosted MCP over OAuth", () => {
  const base64url = (bytes: ArrayBuffer | Uint8Array) =>
    Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64url");

  async function mcp(token: string, method: string, params: unknown = {}) {
    const response = await fetch(`${CORE_URL}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!response.ok) return { status: response.status, result: null };
    const text = await response.text();
    // Either JSON or one SSE message.
    const json = text.trimStart().startsWith("{")
      ? text
      : (text
          .split("\n")
          .find((line) => line.startsWith("data:"))
          ?.slice(5) ?? "null");
    return {
      status: response.status,
      result: (JSON.parse(json) as { result?: Record<string, unknown> } | null)?.result ?? null,
    };
  }

  test("authorize, consent, token, tools/list; shown and disconnected in Agents & API", async () => {
    const adaEmail = uniqueEmail("ada");
    const bobEmail = uniqueEmail("bob");
    const ada = await apiUser(adaEmail);
    const ws = await ada.call<{ id: string }>("POST", "/v1/workspaces", { name: "Pantry" });
    await ada.call("POST", `/v1/workspaces/${ws.id}/invitations`, { email: bobEmail });
    const b = await acceptInvitation(bobEmail);
    expect(b).not.toBeNull();

    const redirectUri = "http://127.0.0.1:43999/callback";
    const registered = (await (
      await fetch(`${CORE_URL}/oauth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_name: "Test agent", redirect_uris: [redirectUri] }),
      })
    ).json()) as { client_id: string };
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = base64url(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    );
    const authorize = new URL(`${CORE_URL}/oauth/authorize`);
    for (const [k, v] of Object.entries({
      response_type: "code",
      client_id: registered.client_id,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: "docs:read docs:write",
      state: "st4te",
      resource: `${CORE_URL}/mcp`,
    })) {
      authorize.searchParams.set(k, v);
    }
    const redirect = await fetch(authorize, { redirect: "manual" });
    expect(redirect.status).toBe(302);
    const location = new URL(redirect.headers.get("location")!);
    expect(location.pathname).toBe("/oauth/consent");
    const requestId = location.searchParams.get("request")!;

    // The consent page, in a browser that is not signed in: sign in inline, then decide.
    const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    contexts.push(context);
    let callback: URL | null = null;
    await context.route(`${redirectUri}**`, async (route) => {
      callback = new URL(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<p>Back in the app</p>",
      });
    });
    const c = await context.newPage();
    c.on("pageerror", (error) => console.error(`[page] ${error.message}`));
    await c.goto(new URL(`/oauth/consent?request=${requestId}`, server.url).toString());
    const card = c.getByTestId("oauth-consent");
    await card.getByRole("heading", { name: "Sign in to Lydie" }).waitFor({ timeout: 30_000 });
    await resetLimits();
    await card.getByLabel("Email").fill(bobEmail);
    await card.getByLabel("Password").fill(PASSWORD);
    await card.getByRole("button", { name: "Sign in", exact: true }).click();
    await card.getByRole("heading", { name: "Test agent wants to use Lydie" }).waitFor();
    await card.getByText(/send you back to 127\.0\.0\.1:43999/).waitFor();
    const permissions = await card.getByRole("list", { name: "Permissions" }).innerText();
    expect(permissions).toContain("Read the pages you can see");
    expect(permissions).toContain("Create, change and delete pages for you");
    await card
      .getByRole("button", { name: /Workspace/ })
      .filter({ hasText: "Pantry" })
      .waitFor();
    await c.screenshot({ path: "/tmp/lydie-oauth-consent.png" });
    await card.getByRole("button", { name: "Approve" }).click();
    await until(async () => callback !== null, 15_000, "the redirect back to the app");
    const back = callback as unknown as URL;
    expect(back.searchParams.get("state")).toBe("st4te");
    const code = back.searchParams.get("code");
    expect(code).toBeTruthy();

    const tokenResponse = await fetch(`${CORE_URL}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code!,
        code_verifier: verifier,
        client_id: registered.client_id,
        redirect_uri: redirectUri,
      }),
    });
    expect(tokenResponse.status).toBe(200);
    const { access_token: accessToken } = (await tokenResponse.json()) as { access_token: string };
    const tools = await mcp(accessToken, "tools/list");
    expect(tools.status).toBe(200);
    const names = ((tools.result?.tools ?? []) as { name: string }[]).map((t) => t.name);
    expect(names.length).toBeGreaterThan(5);

    // Bob's window: the hosted MCP URL, the OAuth snippet and the connected app.
    b!.on("dialog", (dialog) => void dialog.accept());
    const settings = await openSettingsPage(b!, "Agents & API");
    await settings
      .getByText(`${new URL("/__core", server.url).toString()}/mcp`)
      .first()
      .waitFor();
    const oauth = settings.getByRole("radio", { name: "Sign in (OAuth)" });
    await until(async () => await oauth.isEnabled(), 10_000, "OAuth offered");
    await oauth.click({ force: true });
    const snippet = await settings.getByTestId("mcp-snippet").innerText();
    expect(snippet).toContain("claude mcp add --transport http lydie");
    expect(snippet).not.toContain("Authorization");
    const apps = settings.getByTestId("connected-apps");
    await apps.getByText("Test agent").waitFor({ timeout: 15_000 });
    await b!.screenshot({ path: "/tmp/lydie-settings-connected-apps.png" });
    await apps.getByRole("button", { name: "Disconnect Test agent" }).click();
    await apps.waitFor({ state: "detached", timeout: 10_000 });
    await settings.getByText("No apps connected.").waitFor();
    await until(
      async () => (await mcp(accessToken, "tools/list")).status === 401,
      10_000,
      "the token stops working",
    );
  });
});
