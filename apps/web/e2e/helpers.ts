// Shared setup for the web end-to-end suites: serves the e2e build (`bun run build:e2e`, which
// enables `?seed=large`) with `vite preview` on a free port and opens pages in a real browser.
// BROWSER=webkit|firefox runs the same suites in another engine (default chromium).
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, firefox, webkit } from "playwright";
import type { Browser, BrowserContext, BrowserType, Page } from "playwright";

const ROOT = join(import.meta.dir, "..");
export const DIST = join(ROOT, ".e2e", "main");

export type Server = { url: string; stop(): Promise<void> };

async function freePort(): Promise<number> {
  const server = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = server.port;
  server.stop(true);
  return port;
}

// A fixed `port` keeps the origin (and so the browser's storage) the same across runs.
// `outDir` (relative to apps/web): a suite's own build, default .e2e/main. Builds live outside
// dist/ so a plain `vite build` cannot empty them mid-run.
export async function startServer(fixedPort?: number, outDir = ".e2e/main"): Promise<Server> {
  if (!existsSync(join(ROOT, outDir))) throw new Error(`Missing ${outDir}: build it first`);
  const port = fixedPort ?? (await freePort());
  const proc = Bun.spawn(
    [
      "bunx",
      "vite",
      "preview",
      "--configLoader",
      "runner",
      "--outDir",
      outDir,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
  );
  const url = `http://127.0.0.1:${port}/`;
  const started = Date.now();
  for (;;) {
    try {
      const response = await fetch(url);
      if (response.ok) break;
    } catch {
      // not up yet
    }
    if (Date.now() - started > 20_000) {
      proc.kill();
      throw new Error("vite preview did not start");
    }
    await Bun.sleep(100);
  }
  return {
    url,
    async stop() {
      proc.kill();
      await proc.exited;
    },
  };
}

export function browserType(): BrowserType {
  const name = process.env.BROWSER ?? "chromium";
  return name === "webkit" ? webkit : name === "firefox" ? firefox : chromium;
}

export async function launch(): Promise<Browser> {
  return browserType().launch();
}

// A fresh profile on disk per test: like a real browser (WebKit only offers OPFS to persistent
// profiles), and nothing leaks between tests.
export async function newProfile(): Promise<BrowserContext> {
  const dir = mkdtempSync(join(tmpdir(), "lydie-e2e-"));
  const context = await browserType().launchPersistentContext(dir, {
    viewport: { width: 1400, height: 900 },
  });
  context.on("close", () => rmSync(dir, { recursive: true, force: true }));
  return context;
}

// Collects console errors and uncaught exceptions; tests assert it stays empty.
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    // "Failed to load resource" names no URL; the location does.
    const { url } = message.location();
    errors.push(url ? `${message.text()} (${url})` : message.text());
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

export async function openApp(context: BrowserContext, url: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(url);
  await page.getByTestId("app-shell").waitFor({ timeout: 30_000 });
  return page;
}

export const MOD = "ControlOrMeta";

// Polls `fn` until it returns true (Bun's expect has no expect.poll).
export async function until(
  fn: () => Promise<boolean> | boolean,
  timeoutMs = 5000,
  label = "condition",
) {
  const started = Date.now();
  for (;;) {
    if (await fn()) return;
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await Bun.sleep(25);
  }
}

export function tree(page: Page) {
  return page.getByRole("tree", { name: "Documents" });
}

export function treeItem(page: Page, title: string) {
  return tree(page).getByRole("treeitem").filter({ hasText: title });
}

export function tabs(page: Page) {
  return page.getByRole("tab").and(page.getByTestId("tab"));
}

export function activeTitle(page: Page) {
  return page.locator("[data-testid=tab-view][data-focused] textarea[aria-label=Title]");
}

export function activeEditor(page: Page) {
  return page.locator("[data-testid=tab-view][data-focused] [data-doc-content]");
}

// Creates a document from the sidebar's "+" and gives it a title (and optionally a body).
export async function createDoc(page: Page, title: string, body?: string) {
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
  await treeItem(page, title).first().waitFor();
}

export async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `/tmp/lydie-web-${name}.png` });
}
