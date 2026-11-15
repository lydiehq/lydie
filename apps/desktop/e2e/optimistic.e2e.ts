// Optimistic paint in the desktop app, where the backend is remote (the database and the file
// bridge live in the main process): rename, move and a database cell edit must paint in the frame
// after the input, not after the IPC round trip and the write. Measured input → next paint on a
// seeded folder (300 notes, a 300-row database), against the web build in apps/web/.e2e/desktop
// (`bun run build:e2e:desktop` in apps/web), served with `vite preview` and loaded through
// LYDIE_WEB_URL. Prints the numbers; asserts with a margin. Also, in the same real window:
// the global quick-capture shortcut in Settings (main's globalShortcut is checked; an OS-level
// key press cannot be simulated).
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright-core";
import type { ElectronApplication, Page } from "playwright-core";

import { launchEnv } from "./env.ts";

const electronBinary = createRequire(import.meta.url)("electron") as string;
const mainScript = resolve(import.meta.dirname, "../out/main/index.js");
const webRoot = resolve(import.meta.dirname, "../../web");
const webBuild = join(webRoot, ".e2e", "desktop");

let base: string;
let app: ElectronApplication;
let page: Page;
let preview: ReturnType<typeof Bun.spawn> | null = null;
const results: Record<string, unknown> = {};

async function seed(folder: string) {
  await mkdir(join(folder, "Notes"), { recursive: true });
  await mkdir(join(folder, "Tasks"), { recursive: true });
  await mkdir(join(folder, ".obsidian"), { recursive: true });
  await writeFile(
    join(folder, ".obsidian", "types.json"),
    JSON.stringify({ types: { Points: "number" } }),
  );
  for (let i = 0; i < 300; i++) {
    await writeFile(join(folder, "Notes", `Note ${i}.md`), `Note ${i} body.\n`);
  }
  for (let i = 0; i < 300; i++) {
    await writeFile(
      join(folder, "Tasks", `Task ${String(i).padStart(3, "0")}.md`),
      `---\nStatus: todo\nPoints: ${i % 13}\n---\n\nTask ${i}.\n`,
    );
  }
  await writeFile(
    join(folder, "Tasks", "Tasks.base"),
    'filters:\n  and:\n    - file.inFolder("Tasks")\nviews:\n  - type: table\n    name: Table\n    order:\n      - file.name\n      - Points\n      - Status\n',
  );
  for (let i = 0; i < 5; i++) await writeFile(join(folder, `Top ${i}.md`), `Top ${i}.\n`);
}

async function freePort() {
  const probe = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = probe.port;
  probe.stop(true);
  return port;
}

// Calls a backend operation and resolves with ms until the frame showing its result is painted
// (checked on every DOM mutation; a timer set from the next animation frame runs after that frame
// is on screen), and the ms until the operation itself resolved (the round trip). No string eval:
// the renderer's CSP forbids it.
type Change =
  | { kind: "rename"; id: string; title: string }
  | { kind: "move"; id: string; beforeId: string };

async function timeToPaint(change: Change): Promise<{ paint: number; roundTrip: number }> {
  return page.evaluate(
    (change) =>
      new Promise<{ paint: number; roundTrip: number }>((resolvePaint, reject) => {
        const { host } = (window as any).__lydie;
        const row = () =>
          document.querySelector<HTMLElement>(`[data-testid=tree-row][data-doc-id="${change.id}"]`);
        const check = () =>
          change.kind === "rename"
            ? Boolean(row()?.textContent?.includes(change.title))
            : document.querySelector<HTMLElement>("[data-testid=tree-row]")?.dataset.docId ===
              change.id;
        let finished = false;
        let roundTrip = -1;
        const start = performance.now();
        const finish = () => {
          if (finished) return;
          finished = true;
          observer.disconnect();
          requestAnimationFrame(() =>
            setTimeout(() => resolvePaint({ paint: performance.now() - start, roundTrip }), 0),
          );
        };
        const observer = new MutationObserver(() => {
          if (check()) finish();
        });
        observer.observe(document.body, { subtree: true, childList: true, characterData: true });
        const op =
          change.kind === "rename"
            ? host.backend.ops.doc.rename({ id: change.id, title: change.title })
            : host.backend.ops.doc.move({
                id: change.id,
                parentId: null,
                beforeId: change.beforeId,
              });
        void op.then(() => (roundTrip = performance.now() - start));
        if (check()) finish();
        setTimeout(
          () => !finished && reject(new Error(`Timed out: ${JSON.stringify(change)}`)),
          10_000,
        );
      }),
    change,
  );
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1]!;

describe.skipIf(!existsSync(join(webBuild, "index.html")))("desktop optimistic paint", () => {
  beforeAll(async () => {
    base = await realpath(await mkdtemp(join(tmpdir(), "lydie-e2e-optimistic-")));
    const folder = join(base, "vault");
    await seed(folder);
    const port = await freePort();
    preview = Bun.spawn(
      [
        "bunx",
        "vite",
        "preview",
        "--configLoader",
        "runner",
        "--outDir",
        ".e2e/desktop",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--strictPort",
      ],
      { cwd: webRoot, stdout: "ignore", stderr: "ignore" },
    );
    const url = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 200; i++) {
      if (
        await fetch(url)
          .then((r) => r.ok)
          .catch(() => false)
      )
        break;
      await Bun.sleep(100);
    }
    app = await electron.launch({
      executablePath: electronBinary,
      args: [mainScript, `--open-folder=${folder}`],
      env: launchEnv({ LYDIE_USER_DATA: join(base, "user-data"), LYDIE_WEB_URL: url }),
    });
    page = await app.firstWindow();
    await page.getByTestId("app-shell").waitFor({ timeout: 60_000 });
    await page
      .getByRole("treeitem")
      .filter({ hasText: "Top 0" })
      .first()
      .waitFor({ timeout: 30_000 });
  });

  afterAll(async () => {
    process.stderr.write(`Desktop optimistic paint: ${JSON.stringify(results)}\n`);
    await app?.close();
    preview?.kill();
    await preview?.exited;
    await rm(base, { recursive: true, force: true });
  });

  it("renames and moves paint in the frame after the call", async () => {
    const ids = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[data-testid=tree-row]")]
        .filter((r) => r.textContent?.startsWith("Top"))
        .map((r) => r.dataset.docId!),
    );
    expect(ids.length).toBeGreaterThan(2);
    const renames: number[] = [];
    const roundTrips: number[] = [];
    for (let i = 0; i < 5; i++) {
      const timing = await timeToPaint({ kind: "rename", id: ids[0]!, title: `Top renamed ${i}` });
      renames.push(timing.paint);
      await page.waitForTimeout(150);
      roundTrips.push(timing.roundTrip);
    }
    const moves: number[] = [];
    for (let i = 0; i < 3; i++) {
      const first = await page.evaluate(
        () => document.querySelector<HTMLElement>("[data-testid=tree-row]")!.dataset.docId!,
      );
      const moving = ids[(i + 1) % ids.length]!;
      if (moving === first) continue;
      moves.push((await timeToPaint({ kind: "move", id: moving, beforeId: first })).paint);
      await page.waitForTimeout(150);
    }
    results.renamePaintMs = renames.map((v) => Math.round(v * 10) / 10);
    results.renameRoundTripMs = roundTrips.map((v) => Math.round(v * 10) / 10);
    results.movePaintMs = moves.map((v) => Math.round(v * 10) / 10);
    expect(median(renames)).toBeLessThan(34);
    expect(median(moves)).toBeLessThan(34);
  });

  it("a database cell edit paints in the first frame after Enter", async () => {
    await page.evaluate(async () => {
      const { host } = (window as any).__lydie;
      const list = await host.backend.query("database.list", {
        workspaceId: host.app.workspace.workspaceId,
      });
      host.app.openDoc(list.find((d: { title: string }) => d.title === "Tasks").id);
    });
    const grid = page.locator("[data-testid=tab-view][data-focused] [role=grid]");
    await grid.locator("[role=row][data-row-id]").first().waitFor({ timeout: 30_000 });
    const column = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          "[data-testid=tab-view][data-focused] [role=columnheader][data-property-id]",
        ),
      ].findIndex((h) => h.textContent?.includes("Points")),
    );
    const timings: { input: number; dom: number; frame: number; painted: number }[] = [];
    for (let i = 0; i < 5; i++) {
      const row = grid.locator("[role=row][data-row-id]").nth(i);
      const rowId = (await row.getAttribute("data-row-id"))!;
      const value = String(500 + i);
      await row.locator(`[data-cell][data-c="${column}"]`).click();
      await page.keyboard.type(value);
      await page.getByRole("dialog", { name: /^Edit / }).waitFor();
      await page.evaluate(
        ({ rowId, column, value }) => {
          const w = window as any;
          const t: Record<string, number> = {};
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
      timings.push(await page.evaluate(() => (window as any).__timing));
    }
    const first = timings.filter((t) => t.dom !== undefined && t.dom <= t.frame).length;
    results.cellEdit = {
      paintedInFirstFrame: `${first}/${timings.length}`,
      inputToPaintMs: timings.map((t) => Math.round((t.painted - t.input) * 10) / 10),
    };
    expect(first).toBe(timings.length);
  });

  it("the global quick-capture shortcut rebinds, and main registers it", async () => {
    // An OS-level key press cannot be simulated here: this checks Electron's globalShortcut.
    const accelerator = "CommandOrControl+Alt+Shift+F9";
    await page.evaluate(() => (window as any).__lydie.host.app.runCommand("core.openSettings"));
    await page.getByRole("dialog").getByText("Keyboard shortcuts").first().click();
    const row = page.getByTestId("global-shortcut");
    await row.waitFor();
    const before = await row.getByRole("button").first().textContent();
    await row.getByRole("button").first().click();
    await page.getByLabel("Press the new shortcut").waitFor();
    await page.keyboard.press("Meta+Alt+Shift+F9");
    await row.getByText(/F9/).waitFor();
    const registered = await app.evaluate(
      ({ globalShortcut }, acc) => globalShortcut.isRegistered(acc),
      accelerator,
    );
    results.quickCapture = { before, registered };
    expect(registered).toBe(true);
    // Turning it off unregisters it.
    await row.getByRole("button", { name: "Turn off" }).click();
    await row.getByRole("button", { name: "Off" }).waitFor();
    expect(
      await app.evaluate(
        ({ globalShortcut }, acc) => globalShortcut.isRegistered(acc),
        accelerator,
      ),
    ).toBe(false);
  });

  it("privacy mode keeps every window out of screen capture (LYD-382)", async () => {
    const protectedWindows = () =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().map((win) => win.isContentProtected()),
      );
    expect((await protectedWindows()).every((on) => !on)).toBe(true);
    const settings = page.getByRole("dialog", { name: "Settings" });
    if (!(await settings.isVisible())) {
      await page.evaluate(() => (window as any).__lydie.host.app.runCommand("core.openSettings"));
    }
    await settings
      .getByRole("navigation")
      .getByRole("button", { name: "General", exact: true })
      .click();
    const toggle = settings.getByRole("switch", { name: "Hide from screen sharing" });
    await toggle.click({ force: true });
    const until = Date.now() + 5000;
    while (!(await protectedWindows()).every(Boolean) && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect((await protectedWindows()).every(Boolean)).toBe(true);
    await toggle.click({ force: true });
    await page.waitForTimeout(200);
    expect((await protectedWindows()).every((on) => !on)).toBe(true);
  });

  it("the app lock covers the app, survives a reload and unlocks with the PIN (LYD-383)", async () => {
    const settings = page.getByRole("dialog", { name: "Settings" });
    if (!(await settings.isVisible())) {
      await page.evaluate(() => (window as any).__lydie.host.app.runCommand("core.openSettings"));
    }
    await settings
      .getByRole("navigation")
      .getByRole("button", { name: "General", exact: true })
      .click();
    await settings.getByRole("button", { name: "Turn on…" }).click();
    const setup = page.getByRole("dialog", { name: "Turn on the app lock" });
    await setup.getByLabel("PIN or password").fill("12");
    await setup.getByLabel("Again").fill("12");
    await setup.getByRole("button", { name: "Turn on" }).click();
    await setup.getByRole("alert").filter({ hasText: "at least 4" }).waitFor();
    await setup.getByLabel("PIN or password").fill("2468");
    await setup.getByLabel("Again").fill("2468");
    // No Touch ID prompt in a test run.
    const touch = setup.getByRole("switch", { name: "Unlock with Touch ID" });
    if ((await touch.count()) > 0 && (await touch.isChecked())) await touch.click({ force: true });
    await setup.getByRole("button", { name: "Turn on" }).click();
    await setup.waitFor({ state: "detached" });

    const locked = page.getByRole("dialog", { name: "Lydie is locked" });
    await settings.getByRole("button", { name: "Lock now" }).click();
    await locked.waitFor();
    expect(await page.locator("#root").getAttribute("inert")).toBe("");
    // A reload while locked shows the lock screen and never the app.
    await page.reload();
    await locked.waitFor();
    expect(await page.getByTestId("app-shell").count()).toBe(0);
    await locked.getByLabel("PIN or password").fill("0000");
    await locked.getByRole("button", { name: "Unlock" }).click();
    await locked.getByRole("alert").filter({ hasText: "not it" }).waitFor();
    await page.screenshot({ path: "/tmp/lydie-app-lock.png" });
    await locked.getByLabel("PIN or password").fill("2468");
    await locked.getByRole("button", { name: "Unlock" }).click();
    await locked.waitFor({ state: "detached" });
    await page.getByTestId("app-shell").waitFor();
    expect(await page.locator("#root").getAttribute("inert")).toBeNull();

    // Turning it off needs the PIN.
    await page.evaluate(() => (window as any).__lydie.host.app.runCommand("core.openSettings"));
    await settings
      .getByRole("navigation")
      .getByRole("button", { name: "General", exact: true })
      .click();
    await settings.getByRole("button", { name: "Turn off…" }).click();
    const off = page.getByRole("dialog", { name: "Turn off the app lock" });
    await off.getByLabel("PIN or password").fill("2468");
    await off.getByRole("button", { name: "Turn off" }).click();
    await off.waitFor({ state: "detached" });
    await settings.getByRole("button", { name: "Turn on…" }).waitFor();
  });
});
