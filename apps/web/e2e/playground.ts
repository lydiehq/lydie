// Loads the playground in headless Chromium, fails on console errors, exercises the editor and
// writes screenshots. Start the dev server first (`bun run dev:web`).
//   bun e2e/playground.ts [url] [screenshot path]
// Not a `bun test` file on purpose: it needs a running server and a real browser.
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:3000/playground";
const out = process.argv[3] ?? "/tmp/lydie-v2-playground.png";

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1480, height: 1000 },
  deviceScaleFactor: 2,
});
const errors: string[] = [];
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") {
    errors.push(`${message.type()}: ${message.text()}`);
  }
});
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("response", (response) => {
  if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`);
});

const checks: string[] = [];
function check(name: string, ok: boolean) {
  checks.push(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) errors.push(`check failed: ${name}`);
}

try {
  await page.goto(url, { waitUntil: "networkidle" });
  const editor = page.locator(".ProseMirror[data-doc-content]");
  await editor.waitFor();

  for (const type of [
    "callout",
    "wiki-link",
    "embed",
    "math-inline",
    "math-block",
    "footnote-reference",
    "footnote-definition",
    "directive",
    "raw-block",
    "raw-inline",
  ]) {
    check(
      `renders [data-type="${type}"]`,
      (await editor.locator(`[data-type="${type}"]`).count()) > 0,
    );
  }
  for (const tag of [
    "h2",
    "h3",
    "ul",
    "ol",
    "table",
    "img",
    "hr",
    "blockquote",
    "pre",
    "mark",
    'ul[data-type="taskList"]',
  ]) {
    check(`renders ${tag}`, (await editor.locator(tag).count()) > 0);
  }
  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  check(`body font is Inter (${font})`, font.includes("Inter"));
  await page.evaluate(() => document.fonts.ready);

  await page.screenshot({ path: out, fullPage: true });
  await page
    .locator("main > div > div")
    .first()
    .screenshot({ path: out.replace(/\.png$/, "-editor.png") });
  // Optional per-section shots for closer comparison: SHOTS_DIR=/tmp/shots.
  const shots = process.env.SHOTS_DIR;
  if (shots) {
    const sections = page.locator("#components section");
    for (let i = 0; i < (await sections.count()); i++) {
      await sections.nth(i).screenshot({ path: `${shots}/section-${i}.png` });
    }
  }

  // Slash menu: type "/" in an empty paragraph at the end.
  await editor.locator("p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/head");
  const slash = page.locator('[data-lydie-suggestion] [role="listbox"]');
  await slash.waitFor({ timeout: 3000 });
  check("slash menu opens and filters", (await slash.locator('[role="option"]').count()) >= 3);
  await page
    .locator("[data-lydie-suggestion]")
    .screenshot({ path: out.replace(/\.png$/, "-slash.png") });
  await page.keyboard.press("Enter");
  check("slash item inserts a heading", (await editor.locator("h1").count()) > 0);
  await page.keyboard.type("Inserted heading");

  // Wiki link popup.
  await page.keyboard.press("Enter");
  await page.keyboard.type("See [[Out");
  const wiki = page.locator('[data-lydie-suggestion] [role="option"]');
  await wiki.first().waitFor({ timeout: 3000 });
  await page.keyboard.press("Enter");
  check(
    "wiki link inserted from search",
    (await editor.locator('a[data-type="wiki-link"][data-target="Outline"]').count()) > 1,
  );

  // Input rules typed in the browser.
  await page.keyboard.press("Enter");
  await page.keyboard.type("Math $x^2$ done");
  check("inline math input rule", (await editor.locator('[data-type="math-inline"]').count()) > 1);

  // Bubble menu on a selection (the dark toolbar, not the top bar's buttons).
  await editor.locator("em", { hasText: "category" }).dblclick();
  const bubble = page.locator('.playground-bubble [aria-label="Bold"]');
  await bubble.waitFor({ state: "visible", timeout: 3000 });
  check("bubble menu appears on selection", await bubble.isVisible());
  await bubble.click();
  check(
    "bubble bold applies the mark",
    (await editor.locator("strong em, em strong").filter({ hasText: "category" }).count()) > 0,
  );
  await page.screenshot({
    path: out.replace(/\.png$/, "-bubble.png"),
    clip: { x: 260, y: 0, width: 1220, height: 700 },
  });

  // The whole document, without the frame's scroll area.
  await page.goto(`${url}${url.includes("?") ? "&" : "?"}full`, { waitUntil: "networkidle" });
  await page.locator(".ProseMirror[data-doc-content]").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page
    .locator("main > div > div")
    .first()
    .screenshot({ path: out.replace(/\.png$/, "-document.png") });
} catch (error) {
  errors.push(`script: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await browser.close();
}

console.log(checks.join("\n"));
console.log(`screenshot: ${out}`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s):\n${errors.join("\n")}`);
  process.exit(1);
}
console.log("No console errors.");
