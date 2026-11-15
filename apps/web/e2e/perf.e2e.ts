// Performance against a large workspace in the browser store (10k notes in folders, a folder with
// 5k children, a 2k-block document), seeded once through `?seed=large` into a reused profile.
// Thresholds are generous (CI machines vary); the measured numbers are printed and written to
// /tmp/lydie-web-perf.json. Run: `bun run test:perf` (builds first; the first run seeds, ~minutes).
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";

import type { BrowserContext, Page } from "playwright";

import { browserType, startServer, until } from "./helpers.ts";
import type { Server } from "./helpers.ts";

const PROFILE = process.env.LYDIE_PERF_PROFILE ?? "/tmp/lydie-perf-profile";
let server: Server;
let context: BrowserContext;
let page: Page;
const results: Record<string, unknown> = {};

beforeAll(async () => {
  // Same origin every run, so the seeded database in the profile is found again.
  server = await startServer(Number(process.env.LYDIE_PERF_PORT ?? 5197));
  mkdirSync(PROFILE, { recursive: true });
  context = await browserType().launchPersistentContext(PROFILE, {
    viewport: { width: 1400, height: 900 },
  });
  page = await context.newPage();
  page.on("pageerror", (error) => console.error("pageerror", error.message));
  // Seeding runs once per profile; later runs find the workspace already there.
  const started = Date.now();
  await page.goto(`${server.url}?seed=large`);
  await page.getByTestId("app-shell").waitFor({ timeout: 20 * 60_000 });
  results.firstOpenMs = Date.now() - started;
  // Cold start: a new browser process on the seeded profile (no shared worker running yet).
  await context.close();
  context = await browserType().launchPersistentContext(PROFILE, {
    viewport: { width: 1400, height: 900 },
  });
  page = await context.newPage();
  page.on("pageerror", (error) => console.error("pageerror", error.message));
  const cold = Date.now();
  await page.goto(`${server.url}?seed=large`);
  await page.getByTestId("app-shell").waitFor({ timeout: 60_000 });
  await page.getByTestId("tree-row").first().waitFor();
  results.coldBrowserStartToTreeMs = Date.now() - cold;
  results.coldBrowserBootMs = await page.evaluate(
    () => (window as unknown as { __lydie: { bootMs: number } }).__lydie.bootMs,
  );
});

afterAll(async () => {
  writeFileSync("/tmp/lydie-web-perf.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  await context?.close();
  await server?.stop();
});

// Runs `action` in the page and resolves with the ms until the frame that shows `done()` has been
// painted: `done` is checked on every DOM mutation; the paint is the first animation frame after
// the change (a timer set from it runs once that frame is on screen).
async function timeToPaint(action: string, done: string): Promise<number> {
  return page.evaluate(
    ({ action, done }) =>
      new Promise<number>((resolve, reject) => {
        const w = window as unknown as Record<string, unknown>;
        // oxlint-disable-next-line typescript/no-implied-eval -- test-only code built from strings
        const check = () => Boolean(new Function("w", `return (${done})`)(w));
        let finished = false;
        const start = performance.now();
        const finish = () => {
          if (finished) return;
          finished = true;
          observer.disconnect();
          requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - start), 0));
        };
        const observer = new MutationObserver(() => {
          if (check()) finish();
        });
        observer.observe(document.body, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
        });
        // oxlint-disable-next-line typescript/no-implied-eval -- test-only code built from strings
        new Function("w", action)(w);
        if (check()) finish();
        setTimeout(() => {
          if (!finished) reject(new Error(`Timed out: ${done}`));
        }, 10_000);
      }),
    { action, done },
  );
}

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

test("cold start to interactive", async () => {
  const times: number[] = [];
  for (let i = 0; i < 3; i++) {
    const started = Date.now();
    await page.reload();
    await page.getByTestId("app-shell").waitFor();
    await page.getByTestId("tree-row").first().waitFor();
    times.push(Date.now() - started);
  }
  results.coldStartMs = times;
  results.bootMs = await page.evaluate(
    () => (window as unknown as { __lydie: { bootMs: number } }).__lydie.bootMs,
  );
  expect(median(times)).toBeLessThan(5000);
});

test("tree: expanding a folder with 5,000 children is virtualised", async () => {
  // Start from a collapsed tree (expanded folders are remembered per device).
  await page.evaluate(() => localStorage.removeItem("lydie:plugin:document-tree:expanded:bench"));
  await page.reload();
  await page.getByTestId("tree-row").first().waitFor();
  // Scroll the (virtualised) tree to the folder first.
  const { id, index, total } = await page.evaluate(async () => {
    const { host } = (
      window as unknown as {
        __lydie: {
          host: {
            backend: { query: (n: string, p: unknown) => Promise<{ id: string; title: string }[]> };
          };
        };
      }
    ).__lydie;
    const top = await host.backend.query("doc.children", { workspaceId: "bench", parentId: null });
    const tree = await host.backend.query("doc.tree", { workspaceId: "bench" });
    const index = top.findIndex((d) => d.title === "Tasks database");
    return { id: top[index]!.id, index, total: tree.length };
  });
  results.workspaceDocuments = total;
  await page.evaluate((i) => {
    document.querySelector("[data-testid=document-tree]")!.parentElement!.scrollTop = i * 30;
  }, index);
  const row = page.locator(`[data-testid=tree-row][data-doc-id="${id}"]`);
  await row.waitFor();
  const expand = await timeToPaint(
    `document.querySelector('[data-doc-id="${id}"] button[aria-label="Expand"]').click()`,
    `document.querySelector('[data-doc-id="${id}"]')?.getAttribute('aria-expanded') === 'true' && document.querySelectorAll('[data-testid=tree-row][aria-level="2"]').length > 0`,
  );
  const rendered = await page.getByTestId("tree-row").count();
  // Scrolling through it: long frames while scrolling 20 screens.
  const scroll = await page.evaluate(async () => {
    const el = document.querySelector("[data-testid=document-tree]")!.parentElement!;
    const frames: number[] = [];
    let last = performance.now();
    for (let i = 0; i < 60; i++) {
      el.scrollTop += 300;
      await new Promise((r) => requestAnimationFrame(r));
      const now = performance.now();
      frames.push(now - last);
      last = now;
    }
    frames.sort((a, b) => a - b);
    return { p50: frames[30], p95: frames[57], max: frames[59] };
  });
  results.treeExpand5kMs = expand;
  results.treeRowsInDom = rendered;
  results.treeScrollFrameMs = scroll;
  // Collapse again for the next tests.
  await page.evaluate((docId) => {
    (
      document.querySelector(
        `[data-doc-id="${docId}"] button[aria-label="Collapse"]`,
      ) as HTMLElement | null
    )?.click();
  }, id);
  expect(expand).toBeLessThan(1000);
  expect(rendered).toBeLessThan(200);
  expect(scroll.p95!).toBeLessThan(50);
});

test("rename and move paint within a frame or two", async () => {
  await page.evaluate(() => {
    document.querySelector("[data-testid=document-tree]")!.parentElement!.scrollTop = 0;
  });
  await page.waitForTimeout(100);
  const row = page.getByTestId("tree-row").nth(1);
  const id = (await row.getAttribute("data-doc-id"))!;
  const renames: number[] = [];
  for (let i = 0; i < 5; i++) {
    const title = `Renamed ${i} ${Date.now()}`;
    renames.push(
      await timeToPaint(
        `w.__lydie.host.backend.ops.doc.rename({ id: "${id}", title: "${title}" })`,
        `document.querySelector('[data-doc-id="${id}"]')?.textContent.includes("${title}")`,
      ),
    );
  }
  const first = await page.getByTestId("tree-row").first().getAttribute("data-doc-id");
  const move = await timeToPaint(
    `w.__lydie.host.backend.ops.doc.move({ id: "${id}", parentId: null, beforeId: "${first}" })`,
    `document.querySelector('[data-testid=tree-row]')?.getAttribute('data-doc-id') === "${id}"`,
  );
  results.renamePaintMs = renames;
  results.movePaintMs = move;
  // Measured action → painted frame: within two frames even on a busy machine.
  expect(median(renames)).toBeLessThan(34);
  expect(move).toBeLessThan(34);
});

test("open a document, switch tabs without mounting", async () => {
  const ids = await page
    .getByTestId("tree-row")
    .evaluateAll((rows) => rows.slice(2, 4).map((r) => r.getAttribute("data-doc-id")!));
  const open = await timeToPaint(
    `w.__lydie.host.app.openDoc("${ids[0]}")`,
    `document.querySelector('[data-testid=tab-view][data-active] [data-doc-id="${ids[0]}"] [data-doc-content]')`,
  );
  await timeToPaint(
    `w.__lydie.host.app.openDoc("${ids[1]}", { mode: "tab" })`,
    `document.querySelector('[data-testid=tab-view][data-active] [data-doc-id="${ids[1]}"] [data-doc-content]')`,
  );
  const views = await page.getByTestId("tab-view").count();
  const switches: number[] = [];
  for (let i = 0; i < 6; i++) {
    const target = ids[i % 2]!;
    switches.push(
      await timeToPaint(
        `{ const t = [...document.querySelectorAll('[data-testid=tab]')].find((el) => el.textContent && document.querySelector('[data-testid=tab-view][data-tab-id="' + el.dataset.tabId + '"] [data-doc-id="${target}"]')); t.click(); }`,
        `document.querySelector('[data-testid=tab-view][data-active] [data-doc-id="${target}"]')`,
      ),
    );
  }
  expect(await page.getByTestId("tab-view").count()).toBe(views);
  results.openDocMs = open;
  results.tabSwitchMs = switches;
  expect(open).toBeLessThan(1000);
  expect(median(switches)).toBeLessThan(34);
});

test("typing in the 2,000-block document", async () => {
  await page.evaluate(async () => {
    const { host } = (
      window as unknown as {
        __lydie: {
          host: {
            backend: { query: (n: string, p: unknown) => Promise<{ id: string; title: string }[]> };
            app: { openDoc: (id: string, o?: unknown) => void };
          };
        };
      }
    ).__lydie;
    const hits = await host.backend.query("doc.search", {
      workspaceId: "bench",
      text: "Long document",
      limit: 5,
    });
    const doc = hits.find((h) => h.title === "Long document");
    if (doc) host.app.openDoc(doc.id, { mode: "tab" });
  });
  const editor = page.locator("[data-testid=tab-view][data-active] [data-doc-content]");
  await editor.waitFor({ timeout: 30_000 });
  await until(
    async () => (await editor.locator("h2").count()) > 100,
    30_000,
    "long document rendered",
  );
  await editor.locator("p").nth(5).click();
  await page.evaluate(() => {
    const w = window as unknown as { __latencies: number[] };
    w.__latencies = [];
    document.addEventListener(
      "keydown",
      (event) => {
        // Keypress to the next painted frame (a timer set from the frame runs after its paint).
        const t0 = event.timeStamp;
        requestAnimationFrame(() =>
          setTimeout(() => w.__latencies.push(performance.now() - t0), 0),
        );
      },
      true,
    );
  });
  await page.keyboard.type("the quick brown fox jumps over", { delay: 40 });
  await page.waitForTimeout(500);
  const latencies = await page.evaluate(
    () => (window as unknown as { __latencies: number[] }).__latencies,
  );
  latencies.sort((a, b) => a - b);
  results.typingLatencyMs = {
    p50: latencies[Math.floor(latencies.length / 2)],
    p95: latencies[Math.floor(latencies.length * 0.95)],
    max: latencies.at(-1),
  };
  // Keypress → next painted frame.
  expect(latencies[Math.floor(latencies.length / 2)]!).toBeLessThan(25);
  expect(latencies[Math.floor(latencies.length * 0.95)]!).toBeLessThan(34);
});
