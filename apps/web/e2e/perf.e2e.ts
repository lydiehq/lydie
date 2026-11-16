// Performance against a large workspace in the browser store (10k notes in folders, a folder with
// 5k children, a 2k-block document), seeded once through `?seed=large` into a reused profile.
// Thresholds are generous (CI machines vary); the measured numbers are printed and written to
// /tmp/lydie-web-perf.json. Run: `bun run test:perf` (builds first; the first run seeds, ~minutes).
// LYDIE_PERF_PROFILE, LYDIE_PERF_PORT and LYDIE_PERF_OUT_DIR (a build of its own) keep a run apart
// from another one.
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
  server = await startServer(
    Number(process.env.LYDIE_PERF_PORT ?? 5197),
    process.env.LYDIE_PERF_OUT_DIR ?? ".e2e/main",
  );
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
    // A plain folder: a collection opens to its views, not its rows.
    const index = top.findIndex((d) => d.title === "Big folder");
    return { id: top[index]!.id, index, total: tree.length };
  });
  results.workspaceDocuments = total;
  await page.evaluate((i) => {
    document.querySelector("[data-testid=document-tree]")!.parentElement!.scrollTop = i * 32;
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

// The seed's 2,000-block document, open in the active tab.
async function openLongDocument() {
  const id = await page.evaluate(async () => {
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
    if (
      doc &&
      !document.querySelector(`[data-testid=tab-view][data-active] [data-doc-id="${doc.id}"]`)
    )
      host.app.openDoc(doc.id, { mode: "tab" });
    return doc?.id ?? null;
  });
  const editor = page.locator("[data-testid=tab-view][data-active] [data-doc-content]");
  await editor.waitFor({ timeout: 30_000 });
  await until(
    async () => (await editor.locator("h2").count()) > 100,
    30_000,
    "long document rendered",
  );
  return { id: id!, editor };
}

// From now on, every keypress's time to the next painted frame, and every long task (Chromium
// only: elsewhere `longTasks` stays null).
async function startRecording() {
  await page.evaluate(() => {
    const w = window as unknown as {
      __latencies: number[];
      __longTasks: number[] | null;
      __recording?: boolean;
    };
    w.__latencies = [];
    w.__longTasks = PerformanceObserver.supportedEntryTypes.includes("longtask") ? [] : null;
    if (w.__recording) return;
    w.__recording = true;
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
    if (w.__longTasks) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) w.__longTasks?.push(entry.duration);
      }).observe({ type: "longtask" });
    }
  });
}

async function recorded() {
  const { latencies, longTasks } = await page.evaluate(() => {
    const w = window as unknown as { __latencies: number[]; __longTasks: number[] | null };
    return { latencies: w.__latencies, longTasks: w.__longTasks };
  });
  latencies.sort((a, b) => a - b);
  return {
    latencies,
    p50: latencies[Math.floor(latencies.length / 2)]!,
    p95: latencies[Math.floor(latencies.length * 0.95)]!,
    max: latencies.at(-1)!,
    longTasks: longTasks && [...longTasks].sort((a, b) => b - a),
  };
}

test("typing in the 2,000-block document", async () => {
  const { editor } = await openLongDocument();
  await editor.locator("p").nth(5).click();
  await startRecording();
  await page.keyboard.type("the quick brown fox jumps over", { delay: 40 });
  await page.waitForTimeout(500);
  const r = await recorded();
  results.typingLatencyMs = { p50: r.p50, p95: r.p95, max: r.max };
  // Keypress → next painted frame.
  expect(r.p50).toBeLessThan(25);
  expect(r.p95).toBeLessThan(34);
});

// Typing with pauses lets the 400 ms save run between words: each save serialises and verifies
// the body, and the runtime extracts it for the index, on the page's thread.
test("saving while typing in the 2,000-block document", async () => {
  const { id, editor } = await openLongDocument();
  await editor.locator("p").nth(40).click();
  await page.keyboard.press("End");
  await startRecording();
  const words = ["saved", "between", "every", "word", "here"];
  for (const word of words) {
    await page.keyboard.type(` ${word}`, { delay: 40 });
    await page.waitForTimeout(600);
  }
  const r = await recorded();
  const body = await page.evaluate(async (docId) => {
    const w = window as unknown as {
      __lydie: {
        host: {
          backend: {
            query: (n: string, p: unknown) => Promise<{ body: { markdown: string } | null }[]>;
          };
        };
      };
    };
    const [doc] = await w.__lydie.host.backend.query("doc.get", { id: docId, includeBody: true });
    return doc?.body?.markdown ?? "";
  }, id);
  results.savingWhileTyping = {
    p50: r.p50,
    p95: r.p95,
    max: r.max,
    longTasksMs: r.longTasks,
  };
  expect(body).toContain(` ${words.join(" ")}`);
  expect(r.p50).toBeLessThan(25);
  // A save may land on a keypress; it must still not hold the page for long.
  if (r.longTasks) expect(r.longTasks[0] ?? 0).toBeLessThan(250);
});

test("typing in a code block of the 2,000-block document", async () => {
  const { editor } = await openLongDocument();
  const code = editor.locator("pre code").nth(10);
  await code.click();
  await page.keyboard.press("End");
  await startRecording();
  await page.keyboard.type(" + value * 2", { delay: 40 });
  await page.waitForTimeout(600);
  const r = await recorded();
  results.codeBlockTypingMs = { p50: r.p50, p95: r.p95, max: r.max, longTasksMs: r.longTasks };
  expect(await code.textContent()).toContain(" + value * 2");
  expect(r.p50).toBeLessThan(25);
  expect(r.p95).toBeLessThan(34);
});
