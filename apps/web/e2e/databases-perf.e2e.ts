// Database performance on the 5,000-row seed (`?seed=large`, the "Tasks database") and on a
// 10,000-row × 40-column database seeded from the page (`databases-perf-seed.ts`), in a reused
// profile on a fixed port. Grid budgets (p95): arrow/Tab move ≤ 8 ms of work with at most two cells
// and the overlay re-rendering, scroll ≤ 16.7 ms per frame with no blank rows, type-to-edit ≤ 16 ms,
// a cell edit paints in the first frame, paste of 1,000 × 10 cells ≤ 200 ms in one undo step, a
// filter change ≤ 50 ms warm. Assertions are generous (machines vary); measured numbers are
// printed and written to /tmp/lydie-databases-perf.json.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";

import type { BrowserContext, Page } from "playwright";

import { GRID_OPTIONS, GRID_ROWS, installRenderCounter, seedGrid } from "./databases-perf-seed.ts";
import { startDatabasesServer } from "./databases-server.ts";
import type { Server } from "./databases-server.ts";
import { browserType, MOD } from "./helpers.ts";

const PROFILE = process.env.LYDIE_DB_PERF_PROFILE ?? "/tmp/lydie-databases-perf-profile";
let server: Server;
let context: BrowserContext;
let page: Page;
const results: Record<string, unknown> = {};

beforeAll(async () => {
  server = await startDatabasesServer(Number(process.env.LYDIE_DB_PERF_PORT ?? 5198));
  mkdirSync(PROFILE, { recursive: true });
  context = await browserType().launchPersistentContext(PROFILE, {
    viewport: { width: 1400, height: 900 },
  });
  await context.addInitScript(installRenderCounter);
  page = await context.newPage();
  page.on("pageerror", (error) => console.error("pageerror", error.message));
  await page.goto(`${server.url}?seed=large`);
  await page.getByTestId("app-shell").waitFor({ timeout: 20 * 60_000 });
  const id = await page.evaluate(async () => {
    const { host } = (window as any).__lydie;
    const list = await host.backend.query("database.list", { workspaceId: "bench" });
    const tasks = list.find((d: { title: string }) => d.title === "Tasks database");
    host.app.openDoc(tasks.id);
    return tasks.id as string;
  });
  results.databaseId = id;
  await page
    .locator("[data-testid=tab-view][data-focused] [data-testid=table-view]")
    .waitFor({ timeout: 60_000 });
  await page.locator("[role=grid] [role=row][data-row-id]").first().waitFor({ timeout: 30_000 });
});

afterAll(async () => {
  writeFileSync("/tmp/lydie-databases-perf.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  await context?.close();
  await server?.stop();
});

const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))]!;

test("table: scrolling 5,000 rows keeps frames short", async () => {
  const frames = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const grid = document.querySelector<HTMLElement>(
          "[data-testid=tab-view][data-focused] [role=grid]",
        )!;
        const out: number[] = [];
        let last = performance.now();
        let step = 0;
        const tick = () => {
          const now = performance.now();
          if (step > 0) out.push(now - last);
          last = now;
          // ~2 screens per second down, then sideways a little.
          grid.scrollTop += 180;
          if (step % 20 === 10) grid.scrollLeft += 60;
          step++;
          if (step < 240) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      }),
  );
  const rows = await page
    .locator("[data-testid=tab-view][data-focused] [role=grid] [role=row][data-row-id]")
    .count();
  results.scrollFrames = frames.length;
  results.scrollP50Ms = Math.round(percentile(frames, 0.5) * 10) / 10;
  results.scrollP95Ms = Math.round(percentile(frames, 0.95) * 10) / 10;
  results.renderedRows = rows;
  // Virtualised: a screenful of rows, not thousands.
  expect(rows).toBeLessThan(120);
  expect(percentile(frames, 0.95)).toBeLessThan(40);
});

// Input → next paint: the input's event timestamp, the first animation frame after it, and a
// timer set from that frame (which runs once the frame is painted). The DOM change must land
// before that first frame for the edit to paint in it.
type PaintTiming = { input: number; dom: number; frame: number; painted: number };

test("table: a cell edit paints in the first frame after the keypress", async () => {
  const grid = page.locator("[data-testid=tab-view][data-focused] [role=grid]");
  await grid.evaluate((el) => {
    el.scrollTop = 0;
    el.scrollLeft = 0;
  });
  await page.waitForTimeout(300);
  const column = await page.evaluate(async (databaseId) => {
    const { host } = (window as any).__lydie;
    const definition = (await host.backend.query("database.get", { id: databaseId }))[0];
    const number = definition.properties.find((p: { type: string }) => p.type === "number");
    const headers = [
      ...document.querySelectorAll<HTMLElement>(
        "[data-testid=tab-view][data-focused] [role=columnheader][data-property-id]",
      ),
    ];
    return headers.findIndex((h) => h.dataset.propertyId === number.id);
  }, results.databaseId as string);
  const timings: PaintTiming[] = [];
  for (let i = 0; i < 6; i++) {
    const row = grid.locator("[role=row][data-row-id]").nth(i);
    const rowId = (await row.getAttribute("data-row-id"))!;
    const value = String(7000 + i * 11);
    await row.locator(`[data-cell][data-c="${column}"]`).click();
    await page.keyboard.type(value);
    await page.getByRole("dialog", { name: /^Edit / }).waitFor();
    await page.evaluate(
      ({ rowId, column, value }) => {
        const w = window as any;
        const t: Partial<PaintTiming> = {};
        w.__timing = t;
        const cell = () =>
          document.querySelector(
            `[data-testid=tab-view][data-focused] [data-row-id="${rowId}"] [data-cell][data-c="${column}"]`,
          );
        const observer = new MutationObserver(() => {
          if (t.dom === undefined && cell()?.textContent?.includes(value)) {
            t.dom = performance.now();
            observer.disconnect();
          }
        });
        observer.observe(document.body, { subtree: true, childList: true, characterData: true });
        document.addEventListener(
          "keydown",
          (event) => {
            if (event.key !== "Enter") return;
            t.input = event.timeStamp;
            requestAnimationFrame(() => {
              t.frame = performance.now();
              setTimeout(() => (t.painted = performance.now()), 0);
            });
          },
          { capture: true, once: true },
        );
      },
      { rowId, column, value },
    );
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
    timings.push(await page.evaluate(() => (window as any).__timing as PaintTiming));
  }
  const inFirstFrame = timings.filter((t) => t.dom !== undefined && t.dom <= t.frame).length;
  const toPaint = timings.map((t) => t.painted - t.input);
  results.cellEdit = {
    paintedInFirstFrame: `${inFirstFrame}/${timings.length}`,
    inputToDomMs: timings.map((t) => Math.round((t.dom - t.input) * 10) / 10),
    inputToPaintMs: toPaint.map((v) => Math.round(v * 10) / 10),
  };
  expect(inFirstFrame).toBe(timings.length);
  expect(percentile(toPaint, 0.5)).toBeLessThan(20);
});

test("table: a filter change repaints in under 50 ms", async () => {
  const runs = await page.evaluate(async (databaseId) => {
    const { host } = (window as any).__lydie;
    const definition = (await host.backend.query("database.get", { id: databaseId }))[0];
    const view = definition.views[0];
    const status = definition.properties.find(
      (p: { type: string }) => p.type === "status" || p.type === "select",
    );
    const grid = document.querySelector<HTMLElement>(
      "[data-testid=tab-view][data-focused] [role=grid]",
    )!;
    const out: { dom: number; painted: number }[] = [];
    const values = ["todo", "doing", "done", "blocked", "todo", "doing", "done", "blocked"];
    for (const value of values) {
      await new Promise((r) => setTimeout(r, 400));
      const before = grid.getAttribute("aria-rowcount");
      const run: { dom: number; painted: number } = { dom: -1, painted: -1 };
      const start = performance.now();
      const done = new Promise<void>((resolve) => {
        const observer = new MutationObserver(() => {
          if (grid.getAttribute("aria-rowcount") === before) return;
          observer.disconnect();
          run.dom = performance.now() - start;
          requestAnimationFrame(() =>
            setTimeout(() => {
              run.painted = performance.now() - start;
              resolve();
            }, 0),
          );
        });
        observer.observe(grid, { attributes: true, attributeFilter: ["aria-rowcount"] });
      });
      void host.backend.ops.database.updateView({
        id: view.id,
        config: { filter: { type: "condition", propertyId: status.id, op: "eq", value } },
      });
      await done;
      out.push(run);
    }
    await host.backend.ops.database.updateView({
      id: view.id,
      config: { filter: view.config.filter },
    });
    return out;
  }, results.databaseId as string);
  // The first change after loading warms the view's statement; the budget is for warm changes.
  const warm = runs.slice(1).map((r) => r.painted);
  results.filterRepaint = {
    coldMs: Math.round(runs[0]!.painted),
    warmToDomMs: runs.slice(1).map((r) => Math.round(r.dom)),
    warmToPaintMs: warm.map((v) => Math.round(v)),
  };
  expect(percentile(warm, 0.5)).toBeLessThan(50);
});

// ---- The 10,000-row × 40-column grid

const round1 = (v: number) => Math.round(v * 10) / 10;
const stats = (values: number[]) => ({
  n: values.length,
  p50: round1(percentile(values, 0.5)),
  p95: round1(percentile(values, 0.95)),
  max: round1(Math.max(...values)),
});
const focusedGrid = () => page.locator("[data-testid=tab-view][data-focused] [role=grid]");

// One key press: input → end of the handler's synchronous work (React renders discrete input
// synchronously), → first frame, → painted; and the grid cells whose DOM changed.
type KeyTiming = { input: number; done: number; frame: number; painted: number; cells: number };

async function timeKey(key: string): Promise<KeyTiming> {
  await page.evaluate(() => {
    const w = window as any;
    const grid = document.querySelector("[data-testid=tab-view][data-focused] [role=grid]")!;
    const t: Partial<KeyTiming> = {};
    const cells = new Set<Element>();
    w.__key = t;
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target instanceof Element ? r.target : r.target.parentElement;
        const cell = el?.closest("[role=gridcell]");
        if (cell) cells.add(cell);
      }
    });
    observer.observe(grid, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    document.addEventListener(
      "keydown",
      (event) => {
        t.input = event.timeStamp;
        requestAnimationFrame(() => {
          t.frame = performance.now();
          setTimeout(() => {
            t.painted = performance.now();
            t.cells = cells.size;
            observer.disconnect();
          }, 0);
        });
      },
      { capture: true, once: true },
    );
    window.addEventListener("keydown", () => queueMicrotask(() => (t.done = performance.now())), {
      once: true,
    });
  });
  await page.keyboard.press(key);
  await page.waitForTimeout(60);
  const t = await page.evaluate(() => (window as any).__key as KeyTiming);
  // A handler that stopped propagation: fall back to the frame.
  return { ...t, done: t.done ?? t.frame };
}

async function countRenders(action: () => Promise<void>): Promise<Record<string, number>> {
  await page.evaluate(() => {
    const r = (window as any).__renders;
    for (const k of Object.keys(r.counts)) delete r.counts[k];
    r.on = true;
  });
  await action();
  await page.waitForTimeout(80);
  return page.evaluate(() => {
    const r = (window as any).__renders;
    r.on = false;
    return { ...r.counts };
  });
}

async function scrollGridTo(top: number, left = 0) {
  await focusedGrid().evaluate(
    (el, { top, left }) => {
      el.scrollTop = top;
      el.scrollLeft = left;
    },
    { top, left },
  );
  await page.waitForTimeout(400);
}

const gridCell = (rowIndex: number, col: number) =>
  focusedGrid()
    .locator("[role=row][data-row-id]")
    .nth(rowIndex)
    .locator(`[data-cell][data-c="${col}"]`);

describe("10,000 rows × 40 columns", () => {
  let gridId = "";

  test("seed and open", async () => {
    const started = Date.now();
    gridId = await seedGrid(page);
    results.grid10k = { databaseId: gridId, seedOrOpenMs: Date.now() - started };
    await page.evaluate((id) => (window as any).__lydie.host.app.openDoc(id), gridId);
    await page
      .locator(`[data-testid=tab-view][data-focused] [data-database-id="${gridId}"]`)
      .waitFor({ timeout: 60_000 });
    await focusedGrid().locator("[role=row][data-row-id]").first().waitFor({ timeout: 60_000 });
    expect(await focusedGrid().getAttribute("aria-rowcount")).toBe(String(GRID_ROWS + 1));
  });

  test("the table starts at the page's text column and bleeds left when scrolled", async () => {
    await scrollGridTo(0);
    const measure = () =>
      page.evaluate(() => {
        const tab = document.querySelector("[data-testid=tab-view][data-focused]")!;
        const title = [...tab.querySelectorAll<HTMLElement>("[aria-label=Title]")].find(
          (el) => el.getBoundingClientRect().width > 0,
        )!;
        const style = getComputedStyle(title);
        const titleLeft =
          title.getBoundingClientRect().left +
          parseFloat(style.paddingLeft) +
          parseFloat(style.borderLeftWidth);
        const grid = tab.querySelector<HTMLElement>("[role=grid]")!;
        const name = grid.querySelector<HTMLElement>("[role=row][data-row-id] [data-row-title]")!;
        const cells = [
          ...grid.querySelectorAll<HTMLElement>("[role=row][data-row-id] [data-cell]"),
        ].filter((c) => Number(c.dataset.c) > 0);
        return {
          titleLeft,
          gridLeft: grid.getBoundingClientRect().left,
          nameLeft: name.getBoundingClientRect().left,
          minCellLeft: Math.min(...cells.map((c) => c.getBoundingClientRect().left)),
        };
      });
    const before = await measure();
    await scrollGridTo(0, 600);
    const after = await measure();
    results.grid10kInset = { before, after };
    // The scroller spans the page; names line up with the title; scrolled, cells pass it.
    expect(before.gridLeft).toBeLessThan(before.titleLeft - 100);
    expect(Math.abs(before.nameLeft - before.titleLeft)).toBeLessThan(5);
    expect(after.minCellLeft).toBeLessThan(after.titleLeft);
    await scrollGridTo(0);
  });

  test("scroll: frames and blank rows during a fling", async () => {
    await scrollGridTo(0);
    const run = (checkBlank: boolean) =>
      page.evaluate(
        (checkBlank) =>
          new Promise<{ frames: number[]; blank: number; maxCells: number }>((resolve) => {
            const grid = document.querySelector<HTMLElement>(
              "[data-testid=tab-view][data-focused] [role=grid]",
            )!;
            const out: number[] = [];
            let blank = 0;
            let maxCells = 0;
            let last = performance.now();
            let step = 0;
            const tick = () => {
              const now = performance.now();
              if (step > 0) out.push(now - last);
              last = now;
              if (checkBlank && step > 0) {
                const box = grid.getBoundingClientRect();
                const top = box.top + 34;
                const bottom = box.bottom - 34;
                let covered = 0;
                let height = 34;
                for (const row of grid.querySelectorAll("[role=row][data-row-id]")) {
                  const r = row.getBoundingClientRect();
                  height = r.height;
                  covered += Math.max(0, Math.min(bottom, r.bottom) - Math.max(top, r.top));
                }
                if (bottom - top - covered > height) blank++;
                maxCells = Math.max(maxCells, grid.querySelectorAll("[role=gridcell]").length);
              }
              grid.scrollTop += 180;
              if (step % 20 === 10) grid.scrollLeft += 60;
              step++;
              if (step < 240) requestAnimationFrame(tick);
              else resolve({ frames: out, blank, maxCells });
            };
            requestAnimationFrame(tick);
          }),
        checkBlank,
      );
    const timing = await run(false);
    await scrollGridTo(0);
    const coverage = await run(true);
    results.grid10kScroll = {
      frameMs: stats(timing.frames),
      blankFrames: `${coverage.blank}/${coverage.frames.length}`,
      maxLiveGridcells: coverage.maxCells,
    };
    expect(percentile(timing.frames, 0.95)).toBeLessThan(40);
  });

  test("arrow keys move the active cell", async () => {
    await scrollGridTo(0);
    await gridCell(3, 2).click({ modifiers: ["ControlOrMeta"] });
    const keys = [
      ...Array<string>(12).fill("ArrowDown"),
      ...Array<string>(6).fill("ArrowRight"),
      ...Array<string>(12).fill("ArrowUp"),
      ...Array<string>(6).fill("ArrowLeft"),
      ...Array<string>(6).fill("Tab"),
    ];
    const timings: KeyTiming[] = [];
    for (const key of keys) timings.push(await timeKey(key));
    const renders: Record<string, number>[] = [];
    for (const key of ["ArrowDown", "ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"])
      renders.push(await countRenders(() => page.keyboard.press(key)));
    results.grid10kArrow = {
      workMs: stats(timings.map((t) => t.done - t.input)),
      toPaintMs: stats(timings.map((t) => t.painted - t.input)),
      mutatedGridcellsMax: Math.max(...timings.map((t) => t.cells)),
      componentRendersPerMove: renders,
    };
    expect(
      percentile(
        timings.map((t) => t.done - t.input),
        0.5,
      ),
    ).toBeLessThan(50);
  });

  test("type-to-edit opens the editor", async () => {
    await scrollGridTo(0);
    await page.keyboard.press("Escape");
    const timings: { input: number; dom: number; painted: number }[] = [];
    for (let i = 0; i < 10; i++) {
      await gridCell(2 + i, 1).click({ modifiers: ["ControlOrMeta"] });
      await page.evaluate(() => {
        const w = window as any;
        const t: Record<string, number> = {};
        w.__edit = t;
        const observer = new MutationObserver(() => {
          if (document.querySelector("[role=dialog][aria-label^='Edit ']")) {
            t.dom = performance.now();
            observer.disconnect();
            requestAnimationFrame(() => setTimeout(() => (t.painted = performance.now()), 0));
          }
        });
        observer.observe(document.body, { subtree: true, childList: true });
        document.addEventListener("keydown", (e) => (t.input = e.timeStamp), {
          capture: true,
          once: true,
        });
      });
      await page.keyboard.press("7");
      await page.getByRole("dialog", { name: /^Edit / }).waitFor();
      await page.waitForTimeout(60);
      timings.push(await page.evaluate(() => (window as any).__edit));
      await page.keyboard.press("Escape");
      await page.getByRole("dialog", { name: /^Edit / }).waitFor({ state: "detached" });
    }
    results.grid10kTypeToEdit = {
      toDomMs: stats(timings.map((t) => t.dom - t.input)),
      toPaintMs: stats(timings.map((t) => t.painted - t.input)),
    };
    expect(
      percentile(
        timings.map((t) => t.dom - t.input),
        0.5,
      ),
    ).toBeLessThan(100);
  });

  test("paste 1,000 × 10 cells: paint and one undo step", async () => {
    await scrollGridTo(0);
    await page.keyboard.press("Escape");
    await gridCell(0, 1).click({ modifiers: ["ControlOrMeta"] });
    const firstRowId = (await focusedGrid()
      .locator("[role=row][data-row-id]")
      .first()
      .getAttribute("data-row-id"))!;
    const timing = await page.evaluate(
      ({ firstRowId, options }) =>
        new Promise<{ dom: number; painted: number }>((resolve) => {
          const types = ["number", "text", "select", "checkbox", "date", "url"];
          const lines: string[] = [];
          for (let i = 0; i < 1000; i++) {
            const cells: string[] = [];
            for (let c = 0; c < 10; c++) {
              const type = types[c % types.length];
              cells.push(
                type === "number"
                  ? String(50000 + i)
                  : type === "text"
                    ? `pasted ${i}`
                    : type === "select"
                      ? options[i % options.length]!
                      : type === "checkbox"
                        ? i % 2
                          ? "Yes"
                          : "No"
                        : type === "date"
                          ? `2027-01-${String(1 + (i % 28)).padStart(2, "0")}`
                          : `https://pasted.example/${i}`,
              );
            }
            lines.push(cells.join("\t"));
          }
          const grid = document.querySelector<HTMLElement>(
            "[data-testid=tab-view][data-focused] [role=grid]",
          )!;
          const cell = () =>
            grid.querySelector(`[data-row-id="${firstRowId}"] [data-cell][data-c="1"]`);
          const run = { dom: -1, painted: -1 };
          const start = performance.now();
          const observer = new MutationObserver(() => {
            if (!cell()?.textContent?.includes("50000")) return;
            observer.disconnect();
            run.dom = performance.now() - start;
            requestAnimationFrame(() =>
              setTimeout(() => {
                run.painted = performance.now() - start;
                resolve(run);
              }, 0),
            );
          });
          observer.observe(grid, { subtree: true, childList: true, characterData: true });
          const data = new DataTransfer();
          data.setData("text/plain", lines.join("\n"));
          grid.dispatchEvent(
            new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
          );
          setTimeout(() => resolve(run), 10_000);
        }),
      { firstRowId, options: GRID_OPTIONS },
    );
    // How many of the first 1,000 rows got the pasted number (the old grid pasted into the loaded
    // window only).
    const pasted = () =>
      page.evaluate(async (id) => {
        const { host } = (window as any).__lydie;
        const items = await host.backend.query("database.view", {
          databaseId: id,
          window: { offset: 0, limit: 1000 },
        });
        return items.filter(
          (i: any) =>
            i.kind === "row" &&
            typeof i.row.properties.c0 === "number" &&
            i.row.properties.c0 >= 50000,
        ).length as number;
      }, gridId);
    await page.waitForTimeout(1500);
    const rowsPasted = await pasted();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press(`${MOD}+z`);
    await page.waitForTimeout(1500);
    const afterOneUndo = await pasted();
    results.grid10kPaste = {
      toDomMs: round1(timing.dom),
      toPaintMs: round1(timing.painted),
      rowsPasted,
      rowsStillPastedAfterOneUndo: afterOneUndo,
    };
    expect(timing.dom).toBeGreaterThan(0);
    expect(afterOneUndo).toBe(0);
  });

  test("spreadsheet gestures: fill series, X picks rows, ranges copy as TSV and HTML", async () => {
    await scrollGridTo(0);
    await page.keyboard.press("Escape");
    const numbers = async () =>
      page.evaluate(async (id) => {
        const { host } = (window as any).__lydie;
        const items = await host.backend.query("database.view", {
          databaseId: id,
          window: { offset: 0, limit: 5 },
        });
        return items
          .filter((i: any) => i.kind === "row")
          .map((i: any) => i.row.properties.c0 as number);
      }, gridId);
    const before = await numbers();
    // Rows 0-1 of the first number column, then drag the fill handle down to row 4.
    await gridCell(0, 1).click({ modifiers: ["ControlOrMeta"] });
    await gridCell(1, 1).click({ modifiers: ["Shift"] });
    const handle = focusedGrid().locator("[data-fill-handle]");
    const from = (await handle.boundingBox())!;
    const to = (await gridCell(4, 1).boundingBox())!;
    await page.mouse.move(from.x + 3, from.y + 3);
    await page.mouse.down();
    await page.mouse.move(to.x + 20, to.y + to.height / 2, { steps: 6 });
    await page.mouse.up();
    const step = before[1]! - before[0]!;
    const expected = [
      before[0],
      before[1],
      before[1]! + step,
      before[1]! + 2 * step,
      before[1]! + 3 * step,
    ];
    let filled: number[] = [];
    for (let i = 0; i < 30 && JSON.stringify(filled) !== JSON.stringify(expected); i++) {
      await page.waitForTimeout(100);
      filled = await numbers();
    }
    expect(filled).toEqual(expected as number[]);
    // One undo step.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press(`${MOD}+z`);
    let undone: number[] = [];
    for (let i = 0; i < 30 && JSON.stringify(undone) !== JSON.stringify(before); i++) {
      await page.waitForTimeout(100);
      undone = await numbers();
    }
    expect(undone).toEqual(before);

    // X picks the highlighted row, Shift+X extends; Escape steps back out.
    await gridCell(2, 1).click({ modifiers: ["ControlOrMeta"] });
    await page.keyboard.press("x");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Shift+X");
    await page.getByTestId("selected-count").filter({ hasText: "3 selected" }).waitFor();
    await page.keyboard.press("Escape");
    await page.getByTestId("selected-count").waitFor({ state: "detached" });

    // A 2 × 2 range copies as TSV and as an HTML table.
    await gridCell(0, 1).click({ modifiers: ["ControlOrMeta"] });
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Shift+ArrowRight");
    const copied = await focusedGrid().evaluate((el) => {
      const data = new DataTransfer();
      el.dispatchEvent(
        new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }),
      );
      return { text: data.getData("text/plain"), html: data.getData("text/html") };
    });
    expect(copied.text.split("\n")).toHaveLength(2);
    expect(copied.text.split("\n")[0]!.split("\t")).toHaveLength(2);
    expect(copied.html).toContain("<table>");
    results.grid10kGestures = { fill: filled, copied: copied.text };
  });

  test("pointer gestures: resize and move a column, drag a row", async () => {
    await scrollGridTo(0);
    const headers = () =>
      focusedGrid()
        .locator("[role=columnheader][data-property-id]")
        .evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? ""));
    const header = (n: number) =>
      focusedGrid().locator("[role=columnheader][data-property-id]").nth(n);
    const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 8 });
      await page.mouse.up();
    };
    // Resize: the column is 60 px wider once released (and stays so).
    const box = (await header(1).boundingBox())!;
    await drag(
      { x: box.x + box.width - 2, y: box.y + 10 },
      { x: box.x + box.width + 58, y: box.y + 10 },
    );
    await page.waitForTimeout(300);
    expect(Math.round((await header(1).boundingBox())!.width)).toBe(Math.round(box.width) + 60);
    // Move column 1 after column 3.
    const order = await headers();
    const a = (await header(1).boundingBox())!;
    const c = (await header(3).boundingBox())!;
    await drag({ x: a.x + 30, y: a.y + 15 }, { x: c.x + c.width - 20, y: c.y + 15 });
    await page.waitForTimeout(300);
    const moved = await headers();
    expect(moved.slice(1, 4)).toEqual([order[2]!, order[3]!, order[1]!]);
    // Drag the first row below the third (manual order), then undo.
    const rows = () => focusedGrid().locator("[role=row][data-row-id]");
    const first = (await rows().nth(0).getAttribute("data-row-id"))!;
    await rows().nth(0).hover();
    const handle = (await rows().nth(0).locator("[data-drag-handle]").boundingBox())!;
    const third = (await rows().nth(2).boundingBox())!;
    await drag(
      { x: handle.x + 3, y: handle.y + 5 },
      { x: handle.x + 3, y: third.y + third.height * 0.75 },
    );
    await focusedGrid()
      .locator(`[role=row][data-row-id="${first}"][data-r="2"]`)
      .waitFor({ timeout: 3000 });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press(`${MOD}+z`);
    await focusedGrid()
      .locator(`[role=row][data-row-id="${first}"][data-r="0"]`)
      .waitFor({ timeout: 3000 });
    // Personal view changes back to the saved view.
    await page.getByTestId("view-edited").getByRole("button", { name: "Reset" }).click();
    await page.waitForTimeout(300);
    expect(await headers()).toEqual(order);
  });

  test("filter change on 10,000 rows", async () => {
    const runs = await page.evaluate(
      async ({ databaseId, options }) => {
        const { host } = (window as any).__lydie;
        const definition = (await host.backend.query("database.get", { id: databaseId }))[0];
        const view = definition.views[0];
        const select = definition.properties.find((p: { type: string }) => p.type === "select");
        const grid = document.querySelector<HTMLElement>(
          "[data-testid=tab-view][data-focused] [role=grid]",
        )!;
        const out: { dom: number; painted: number }[] = [];
        for (const value of [...options, ...options, ...options, ...options]) {
          await new Promise((r) => setTimeout(r, 400));
          const before = grid.getAttribute("aria-rowcount");
          const run = { dom: -1, painted: -1 };
          const start = performance.now();
          const done = new Promise<void>((resolve) => {
            const observer = new MutationObserver(() => {
              if (grid.getAttribute("aria-rowcount") === before) return;
              observer.disconnect();
              run.dom = performance.now() - start;
              requestAnimationFrame(() =>
                setTimeout(() => {
                  run.painted = performance.now() - start;
                  resolve();
                }, 0),
              );
            });
            observer.observe(grid, { attributes: true, attributeFilter: ["aria-rowcount"] });
            setTimeout(() => {
              observer.disconnect();
              resolve();
            }, 5000);
          });
          void host.backend.ops.database.updateView({
            id: view.id,
            config: { filter: { type: "condition", propertyId: select.id, op: "eq", value } },
          });
          await done;
          out.push(run);
        }
        await host.backend.ops.database.updateView({
          id: view.id,
          config: { filter: view.config.filter },
        });
        return out;
      },
      { databaseId: gridId, options: GRID_OPTIONS },
    );
    const warm = runs.slice(1).map((r) => r.painted);
    results.grid10kFilter = {
      coldMs: Math.round(runs[0]!.painted),
      warmToDomMs: stats(runs.slice(1).map((r) => r.dom)),
      warmToPaintMs: stats(warm),
    };
    expect(percentile(warm, 0.5)).toBeLessThan(150);
  });
});
