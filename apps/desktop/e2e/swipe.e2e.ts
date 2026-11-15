// Two-finger swipe navigation through the real input path: the trackpad addon's `simulate` posts
// scroll events with phases into AppKit, its monitor reports them, the main process forwards them
// and the page's recognizer goes back or forward. macOS only, with native/build/trackpad.node.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright-core";
import type { ElectronApplication, Page } from "playwright-core";

import { launchEnv } from "./env.ts";
import { poll } from "./poll.ts";

const electronBinary = createRequire(import.meta.url)("electron") as string;
const mainScript = resolve(import.meta.dirname, "../out/main/index.js");
const webDist = resolve(import.meta.dirname, "../../web/.e2e/desktop");
const addon = resolve(import.meta.dirname, "../native/build/trackpad.node");

// CGScrollPhase / CGMomentumScrollPhase.
const BEGAN = 1;
const CHANGED = 2;
const ENDED = 4;
const MOMENTUM_CONTINUE = 2;

type Simulated = { phase: number; momentumPhase: number; deltaX: number; deltaY: number };

// Scrolling left (AppKit's scrollingDeltaX is positive to the left) goes back.
const scrollLeft = (points: number): Simulated => ({
  phase: CHANGED,
  momentumPhase: 0,
  deltaX: points,
  deltaY: 0,
});
const began: Simulated = { phase: BEGAN, momentumPhase: 0, deltaX: 0, deltaY: 0 };
const ended: Simulated = { phase: ENDED, momentumPhase: 0, deltaX: 0, deltaY: 0 };

let base: string;
let app: ElectronApplication;
let page: Page;

async function simulate(events: Simulated[]) {
  await app.evaluate(
    ({ BrowserWindow }, [path, list]) => {
      // The addon the app already loaded (same path, same module).
      const req = (
        process as unknown as {
          getBuiltinModule(id: "node:module"): typeof import("node:module");
        }
      )
        .getBuiltinModule("node:module")
        .createRequire(path);
      const native = req(path) as { simulate(handle: Buffer, events: unknown[]): void };
      native.simulate(BrowserWindow.getAllWindows()[0]!.getNativeWindowHandle(), list);
    },
    [addon, events] as const,
  );
}

const activeTab = () =>
  page
    .locator("[role=tab][aria-selected=true]")
    .first()
    .textContent()
    .then((text) => text?.trim() ?? "");

describe.skipIf(process.platform !== "darwin" || !existsSync(addon))("two-finger swipes", () => {
  beforeAll(async () => {
    base = await realpath(await mkdtemp(join(tmpdir(), "lydie-e2e-swipe-")));
    const folder = join(base, "vault");
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "Alpha.md"), "Alpha note.\n");
    await writeFile(join(folder, "Beta.md"), "Beta note.\n");
    app = await electron.launch({
      executablePath: electronBinary,
      args: [mainScript, `--open-folder=${folder}`],
      env: launchEnv({ LYDIE_USER_DATA: join(base, "user-data"), LYDIE_WEB_DIST: webDist }),
    });
    page = await app.firstWindow();
    await page.getByTestId("app-shell").waitFor({ timeout: 30_000 });
    const tree = page.getByRole("tree", { name: "Documents" });
    for (const name of ["Alpha", "Beta"]) {
      await tree.getByRole("treeitem").filter({ hasText: name }).first().click();
      await poll(activeTab, (tab) => tab === name, 5_000);
    }
  });

  afterAll(async () => {
    await app?.close();
    await rm(base, { recursive: true, force: true });
  });

  it("reports the trackpad to the page", async () => {
    expect(await page.evaluate(() => window.lydiePlatform.capabilities.trackpad)).toBe(true);
  });

  it("a short swipe and a vertical scroll do not navigate", async () => {
    await simulate([began, scrollLeft(10), scrollLeft(10), ended]);
    await simulate([
      began,
      ...Array.from({ length: 10 }, () => ({
        phase: CHANGED,
        momentumPhase: 0,
        deltaX: 4,
        deltaY: -20,
      })),
      ended,
    ]);
    await page.waitForTimeout(300);
    expect(await activeTab()).toBe("Beta");
  });

  it("the arrow follows a swipe and lifting past the distance goes back", async () => {
    await simulate([began, ...Array.from({ length: 16 }, () => scrollLeft(12))]);
    const arrow = page.getByTestId("swipe-back");
    const shown = await poll(
      () => arrow.evaluate((el) => [getComputedStyle(el).opacity, el.hasAttribute("data-armed")]),
      ([opacity, armed]) => opacity === "1" && armed === true,
      5_000,
    );
    expect(shown).toEqual(["1", true]);
    expect(await activeTab()).toBe("Beta");
    await simulate([ended, { phase: 0, momentumPhase: MOMENTUM_CONTINUE, deltaX: 8, deltaY: 0 }]);
    expect(await poll(activeTab, (tab) => tab === "Alpha", 5_000)).toBe("Alpha");
  });
});
