// Startup and memory numbers for the S6 baseline, printed as one JSON line when LYDIE_MEASURE is
// set (see scripts/measure.ts).
import { app } from "electron";
import type { BrowserWindow } from "electron";

// Epoch milliseconds of the page's first contentful paint: the first text (the boot shell has none,
// so this is usually the app's shell or the start screen).
const FIRST_PAINT = `new Promise((resolve) => {
  const report = (entry) => resolve(performance.timeOrigin + entry.startTime);
  const found = performance.getEntriesByName("first-contentful-paint")[0];
  if (found) return report(found);
  new PerformanceObserver((list) => {
    const entry = list.getEntriesByName("first-contentful-paint")[0];
    if (entry) report(entry);
  }).observe({ type: "paint", buffered: true });
})`;

// When the workspace was ready (the app's "lydie:ready" mark) and when the first row of the
// sidebar's document tree was on screen, in epoch milliseconds; null for a window that shows
// something else (the start screen) within the timeout.
const READY = `new Promise((resolve) => {
  const started = Date.now();
  const check = () => {
    const ready = performance.getEntriesByName("lydie:ready")[0];
    const row = document.querySelector('[role="tree"] [role="treeitem"]');
    if (ready && row) {
      return requestAnimationFrame(() =>
        resolve({ readyAt: performance.timeOrigin + ready.startTime, firstRowAt: Date.now() }),
      );
    }
    if (Date.now() - started > 30000) return resolve({ readyAt: null, firstRowAt: null });
    setTimeout(check, 5);
  };
  check();
})`;

export async function reportMeasurements(win: BrowserWindow, mainStartedAt: number) {
  const readyAt = Date.now();
  // The caller awaited loadURL; the paint observer below waits for the rest.
  const firstPaintAt = (await win.webContents.executeJavaScript(FIRST_PAINT)) as number;
  const workspace = (await win.webContents.executeJavaScript(READY)) as {
    readyAt: number | null;
    firstRowAt: number | null;
  };
  const idleMs = Number(process.env.LYDIE_MEASURE_IDLE_MS ?? 5000);
  await new Promise((resolve) => setTimeout(resolve, idleMs));

  const memory: Record<string, number> = {};
  for (const metric of app.getAppMetrics()) {
    // Working set in KB; private bytes are only reported on Windows.
    memory[metric.type] = (memory[metric.type] ?? 0) + metric.memory.workingSetSize;
  }
  const result = {
    mainStartedAt,
    windowCreatedAt: readyAt,
    firstPaintAt,
    workspaceReadyAt: workspace.readyAt,
    firstRowAt: workspace.firstRowAt,
    memoryKB: memory,
    totalKB: Object.values(memory).reduce((a, b) => a + b, 0),
    processes: app.getAppMetrics().map((m) => ({ pid: m.pid, type: m.type })),
  };
  process.stdout.write(`LYDIE_MEASURE ${JSON.stringify(result)}\n`);
  // Otherwise the caller inspects the processes (e.g. with `footprint`) and then terminates us.
  if (process.env.LYDIE_MEASURE_QUIT) app.quit();
}
