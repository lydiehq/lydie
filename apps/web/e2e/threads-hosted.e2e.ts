// Comments on a hosted page, for someone who may comment but not edit: they see the
// note an agent or a colleague left, and start a comment from the selection toolbar of a
// read-only editor. The workspace is set up through the API; the guest uses a real browser.
// Skipped with a message when the stack is down. Run: `bun run test:e2e:threads:hosted`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import type { Browser, BrowserContext, Page } from "playwright";

import { activeEditor, launch, until } from "./helpers.ts";
import { CORE_URL, coreIsUp, startSettingsServer } from "./settings-server.ts";
import type { SettingsServer } from "./settings-server.ts";

const up = await coreIsUp();
if (!up) console.warn(`[threads-hosted.e2e] skipped: the hosted API at ${CORE_URL} is not running`);

const PASSWORD = "password1234";
const run = Date.now().toString(36);
const BODY = "This is a filter on the cloud sync peer, not a new mechanism.\n";

let server: SettingsServer;
let browser: Browser;
const contexts: BrowserContext[] = [];

type User = { id: string; email: string; token: string };

async function api<T>(path: string, token: string | null, body?: unknown): Promise<T> {
  const response = await fetch(`${CORE_URL}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} -> ${response.status}: ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function createUser(name: string): Promise<User> {
  const email = `${name}-${run}@example.com`;
  const result = await api<{ user: { id: string }; token: string }>("/dev/users", null, {
    email,
    password: PASSWORD,
  });
  return { id: result.user.id, email, token: result.token };
}

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

// A fresh browser: sign in and open the workspace by name.
async function signInAndOpen(email: string, workspaceName: string): Promise<Page> {
  await fetch(`${CORE_URL}/dev/rate-limits/reset`, { method: "POST" }).catch(() => {});
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`[page] ${error.message}`));
  await page.goto(server.url);
  await page.getByTestId("app-shell").waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: /^Workspace:/ }).click();
  await page.getByRole("button", { name: "Sign in…" }).click();
  const dialog = page.getByRole("dialog", { name: /Sign in|Create an account/ });
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Password").fill(PASSWORD);
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await dialog.waitFor({ state: "detached" });
  await page.getByRole("button", { name: /^Workspace:/ }).click();
  await page
    .getByTestId("workspace-list")
    .getByRole("button")
    .filter({ hasText: workspaceName })
    .filter({ hasNotText: "This browser" })
    .first()
    .click();
  await page.getByTestId("app-shell").waitFor({ timeout: 30_000 });
  await page.getByTestId("sync-status").waitFor({ timeout: 30_000 });
  return page;
}

// Selects the first occurrence of `text` in the editor by dragging the mouse over it.
async function select(page: Page, text: string) {
  const box = await activeEditor(page).evaluate((root, wanted) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.textContent?.indexOf(wanted) ?? -1;
      if (index === -1) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + wanted.length);
      const rect = range.getBoundingClientRect();
      return { left: rect.left, right: rect.right, y: rect.top + rect.height / 2 };
    }
    throw new Error(`"${wanted}" is not in the editor`);
  }, text);
  await page.mouse.move(box.left + 1, box.y);
  await page.mouse.down();
  await page.mouse.move(box.right - 1, box.y, { steps: 8 });
  await page.mouse.up();
}

describe.skipIf(!up)("notes and comments, hosted", () => {
  test("a guest with comment access reads a note and comments without editing", async () => {
    const owner = await createUser("owner");
    const guest = await createUser("guest");
    const name = `Threads ${run}`;
    const workspace = await api<{ id: string }>("/v1/workspaces", owner.token, { name });
    const { teamspaces } = await api<{ teamspaces: { id: string; isDefault: boolean }[] }>(
      `/v1/workspaces/${workspace.id}/teamspaces`,
      owner.token,
    );
    const doc = await api<{ id: string }>("/v1/documents", owner.token, {
      workspaceId: workspace.id,
      teamspaceId: teamspaces.find((t) => t.isDefault)!.id,
      title: "Sync scope",
      markdown: BODY,
    });
    await api(`/v1/documents/${doc.id}/threads`, owner.token, {
      body: "Checked against the plan.",
      quote: "not a new mechanism",
    });
    await api(`/v1/documents/${doc.id}/invite`, owner.token, {
      email: guest.email,
      level: "comment",
    });

    const page = await signInAndOpen(guest.email, name);
    await page.getByRole("treeitem").filter({ hasText: "Sync scope" }).first().click();
    const editor = activeEditor(page);
    await editor.getByText("This is a filter").waitFor({ timeout: 30_000 });
    await page.getByText("You can view this page but not edit it.").waitFor({ timeout: 30_000 });

    // The owner's note is marked on its passage, with its card beside the text.
    const note = editor.locator("[data-thread][data-thread-kind=note]");
    await note.waitFor({ timeout: 30_000 });
    expect(await note.textContent()).toBe("not a new mechanism");
    const margin = page.getByRole("complementary", { name: "Comments" });
    await margin.getByText("Checked against the plan.").waitFor();

    // No formatting in the selection toolbar, but a comment can be started.
    await select(page, "cloud sync peer");
    const comment = page.getByRole("button", { name: "Comment", exact: true });
    await comment.waitFor();
    expect(await page.getByRole("button", { name: "Bold" }).count()).toBe(0);
    await comment.click();
    const draft = page.getByRole("region", { name: "New comment" });
    await draft.getByRole("textbox", { name: "Comment" }).fill("Which peer exactly?");
    await draft.getByRole("button", { name: "Add comment" }).click();
    await editor.locator("[data-thread][data-thread-kind=comment]").waitFor({ timeout: 20_000 });
    await page.screenshot({ path: "/tmp/lydie-threads-hosted-guest.png" });

    // It reached the server as the guest's, on the passage; the body is as it was.
    type Thread = { body: string; createdBy: string; anchor: { quote: string } | null };
    let threads: Thread[] = [];
    await until(
      async () => {
        ({ threads } = await api<{ threads: Thread[] }>(
          `/v1/documents/${doc.id}/threads`,
          owner.token,
        ));
        return threads.length === 2;
      },
      20_000,
      "the guest's comment on the server",
    );
    const theirs = threads.find((t) => t.body === "Which peer exactly?");
    expect(theirs).toMatchObject({ createdBy: guest.id, anchor: { quote: "cloud sync peer" } });
    const { body } = await api<{ body: { markdown: string } }>(
      `/v1/documents/${doc.id}`,
      owner.token,
    );
    expect(body.markdown).toBe(BODY);
  });
});
