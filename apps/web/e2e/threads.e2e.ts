// Comments beside a document, in a real browser: a comment on selected text, the highlighted
// passage and its card in the margin, replies, resolving, a comment on the page, hiding them, a
// narrow page, and a comment staying on its passage while the text is edited.
// Run: `bun run test:e2e:threads`.
// E2E_URL=http://127.0.0.1:<port>/ runs against a dev server instead of the build.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import type { BrowserContext, Page } from "playwright";

import {
  activeEditor,
  createDoc,
  newProfile,
  openApp,
  startServer,
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
    server = await startServer(undefined, process.env.E2E_DIST ?? ".e2e/threads");
    url = server.url;
  }
});

afterAll(async () => {
  await server?.stop();
});

beforeEach(async () => {
  context = await newProfile();
  page = await openApp(context, url);
  errors = watchErrors(page);
});

// Requests to a core on this machine fail: the core refuses the preview server's origin, or is not
// running. Not what this suite is about.
const unrelated = (error: string) =>
  error === "Failed to load resource: net::ERR_FAILED" ||
  error === "Failed to load resource: net::ERR_CONNECTION_REFUSED";

afterEach(async () => {
  await context?.close();
  expect(errors.filter((error) => !unrelated(error))).toEqual([]);
});

const shot = (name: string) => page.screenshot({ path: `/tmp/lydie-threads-${name}.png` });

// Selects the first occurrence of `text` in the editor, as a mouse selection would.
async function select(text: string) {
  await activeEditor(page).evaluate((root, wanted) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.textContent?.indexOf(wanted) ?? -1;
      if (index === -1) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + wanted.length);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    throw new Error(`"${wanted}" is not in the editor`);
  }, text);
}

const passage = () => activeEditor(page).locator("[data-thread]");
const margin = () => page.getByRole("complementary", { name: "Comments" });

// The field of a new comment, which has focus as soon as it shows.
async function draftField() {
  const field = page
    .getByRole("region", { name: "New comment" })
    .getByRole("textbox", { name: "Comment" });
  await field.waitFor();
  await until(
    () => field.evaluate((el) => el === document.activeElement),
    2000,
    "the new comment's field has focus",
  );
  return field;
}

describe("comments", () => {
  test("comment on a passage beside the text, reply, and resolve", async () => {
    await createDoc(page, "Plan", "This is a filter on the cloud sync peer, not a new mechanism.");
    await select("cloud sync peer");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await (await draftField()).fill("Which peer exactly?");
    await shot("draft");
    await page.getByRole("button", { name: "Add comment" }).click();

    // The passage is marked, and the body is not changed by the comment.
    await passage().waitFor();
    expect(await passage().textContent()).toBe("cloud sync peer");
    expect(await activeEditor(page).textContent()).toBe(
      "This is a filter on the cloud sync peer, not a new mechanism.",
    );

    // Its card is in the margin, right of the passage and level with it.
    const card = margin().getByRole("article", { name: /^Comment by/ });
    await card.getByText("Which peer exactly?").waitFor();
    const [mark, box] = [await passage().boundingBox(), await card.boundingBox()];
    expect(box!.x).toBeGreaterThan(mark!.x + mark!.width);
    expect(Math.abs(box!.y - mark!.y)).toBeLessThan(40);

    // A click on the passage opens it.
    await passage().click();
    await card.getByRole("textbox", { name: "Reply" }).fill("The cloud one.");
    await card.getByRole("button", { name: "Reply", exact: true }).click();
    await card.getByText("The cloud one.").waitFor();
    await shot("card");

    // The top bar counts it.
    await page.getByRole("button", { name: "1 open comment" }).waitFor();
    await card.getByRole("button", { name: "Resolve" }).click();
    await until(async () => (await passage().count()) === 0, 5000, "mark removed");
    await until(async () => (await card.count()) === 0, 5000, "card removed");

    // Resolved ones come back from the top bar's menu.
    await page.getByRole("button", { name: "Comments" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Show resolved (1)" }).click();
    await page.keyboard.press("Escape");
    await card.getByText("Which peer exactly?").waitFor();
    await shot("resolved");
  });

  test("a comment stays on its passage while the text around and inside it is edited", async () => {
    await createDoc(page, "Notes", "Alpha beta gamma delta.");
    await select("beta gamma");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await (await draftField()).fill("Checked against the plan.");
    await page.getByRole("button", { name: "Add comment" }).click();
    await passage().waitFor();

    // Type before the passage, then inside it.
    await activeEditor(page).click();
    await page.keyboard.press("ControlOrMeta+ArrowUp");
    await page.keyboard.type("Intro. ", { delay: 10 });
    expect(await passage().textContent()).toBe("beta gamma");
    await select("a g");
    await page.keyboard.type("A-G", { delay: 10 });
    await until(
      async () => (await passage().textContent()) === "betA-Gamma",
      3000,
      "passage follows the edit",
    );

    // The new passage is saved as the anchor: it is still there after a reload.
    await page.waitForTimeout(2500);
    await page.reload();
    await page.getByTestId("app-shell").waitFor();
    await passage().waitFor();
    expect(await passage().textContent()).toBe("betA-Gamma");
  });

  test("a comment on the page, one by shortcut, a second draft, and hiding them", async () => {
    await createDoc(
      page,
      "Page",
      "One paragraph of text to point at.\n\nAnother one further down.",
    );
    await page.getByRole("button", { name: "Comments" }).click();
    await page.getByRole("menuitem", { name: "Comment on this page" }).click();
    await (await draftField()).fill("Source: a review.");
    await page.keyboard.press("ControlOrMeta+Enter");
    await margin().getByText("Source: a review.").waitFor();

    // A draft left open moves to the next passage commented on, with an empty field.
    await select("paragraph of text");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await (await draftField()).fill("Not this one.");
    await activeEditor(page).click();
    await select("further down");
    // The editor has the selection once its toolbar shows.
    await page.getByRole("button", { name: "Comment", exact: true }).waitFor();
    await page.keyboard.press("ControlOrMeta+Alt+M");
    const field = await draftField();
    expect(await field.inputValue()).toBe("");
    const [mark, draft] = [
      await activeEditor(page).locator("[data-thread-draft]").boundingBox(),
      await page.getByRole("region", { name: "New comment" }).boundingBox(),
    ];
    expect(Math.abs(draft!.y - mark!.y)).toBeLessThan(40);
    await field.fill("Tighten this.");
    await page.keyboard.press("ControlOrMeta+Enter");
    await passage().waitFor();
    expect(await passage().textContent()).toBe("further down");
    await shot("page");

    // Hidden in the text and beside it.
    await page.getByRole("button", { name: "1 open comment" }).waitFor({ state: "detached" });
    await page.getByRole("button", { name: "2 open comments" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Show comments" }).click();
    await page.keyboard.press("Escape");
    await until(async () => (await passage().count()) === 0, 5000, "marks hidden");
    await until(async () => (await margin().count()) === 0, 5000, "margin hidden");
  });

  test("a narrow page shows markers that open the card", async () => {
    await page.setViewportSize({ width: 820, height: 700 });
    await createDoc(page, "Narrow", "A short page to comment on.");
    await select("short page");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    const field = page.getByRole("dialog", { name: "New comment" }).getByRole("textbox");
    await field.waitFor();
    await until(() => field.evaluate((el) => el === document.activeElement), 2000, "focus");
    await field.fill("Too short?");
    await page.keyboard.press("ControlOrMeta+Enter");
    await margin()
      .getByRole("button", { name: /^Comment by/ })
      .click();
    await page.getByRole("dialog", { name: "Comment" }).getByText("Too short?").waitFor();
    await shot("narrow");
  });
});
