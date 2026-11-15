// A plain launch reopens the folder the app was last on, and falls back to the start screen (with
// the folder still listed) once that folder is gone. Loads apps/web/.e2e/desktop (LYDIE_WEB_DIST),
// built by the desktop `test:e2e` script.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { Platform, WorkspaceScope } from "@lydie/platform";
import { _electron as electron } from "playwright-core";
import type { ElectronApplication, Page } from "playwright-core";

import { launchEnv } from "./env.ts";
import { poll } from "./poll.ts";

const electronBinary = createRequire(import.meta.url)("electron") as string;
const mainScript = resolve(import.meta.dirname, "../out/main/index.js");
const webDist = resolve(import.meta.dirname, "../../web/.e2e/desktop");

let base: string;
let folder: string;
let env: Record<string, string>;
let app: ElectronApplication | null = null;

async function launch(args: string[] = []): Promise<Page> {
  app = await electron.launch({ executablePath: electronBinary, args: [mainScript, ...args], env });
  return app.firstWindow();
}

async function quit() {
  await app?.close();
  app = null;
}

const scopeOf = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { lydiePlatform: Platform }).lydiePlatform.scope,
  ) as Promise<WorkspaceScope>;

describe.skipIf(!existsSync(join(webDist, "index.html")))("reopening the last workspace", () => {
  beforeAll(async () => {
    base = await realpath(await mkdtemp(join(tmpdir(), "lydie-e2e-restore-")));
    folder = join(base, "vault");
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "Note.md"), "Hello.\n");
    env = launchEnv({ LYDIE_USER_DATA: join(base, "user-data"), LYDIE_WEB_DIST: webDist });
  });

  afterAll(async () => {
    await quit();
    await rm(base, { recursive: true, force: true });
  });

  it("reopens the folder after a launch without arguments", async () => {
    const first = await launch([`--open-folder=${folder}`]);
    await first.getByTestId("app-shell").waitFor({ timeout: 30_000 });
    const state = join(base, "user-data", "state.json");
    const saved = await poll(
      () => readFile(state, "utf8").catch(() => ""),
      (text) => text.includes('"lastWorkspace"'),
    );
    expect(JSON.parse(saved).lastWorkspace).toEqual({ kind: "folder", id: folder });
    await quit();

    const second = await launch();
    await second.getByTestId("app-shell").waitFor({ timeout: 30_000 });
    expect(await scopeOf(second)).toMatchObject({ kind: "local", folder: { id: folder } });
    await quit();
  });

  it("shows the start screen when the folder is gone, and says so when it is picked", async () => {
    await rm(folder, { recursive: true, force: true });
    const page = await launch();
    await page.getByTestId("desktop-start").waitFor({ timeout: 30_000 });
    expect((await scopeOf(page)).kind).toBe("none");
    const recent = page.getByTestId("recent-workspaces");
    await recent.getByRole("button", { name: /^vault/ }).click();
    await page.getByRole("alert").filter({ hasText: "moved or deleted" }).waitFor();

    await recent.getByRole("button", { name: "Remove vault from the list" }).click();
    await recent.waitFor({ state: "detached" });
    await quit();
  });

  it("switches to another recent folder from the workspace menu, in place", async () => {
    const [one, two] = [join(base, "One"), join(base, "Two")];
    for (const dir of [one, two]) {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "Note.md"), "Hi.\n");
    }
    await (await launch([`--open-folder=${one}`])).getByTestId("app-shell").waitFor({
      timeout: 30_000,
    });
    await quit();

    const page = await launch([`--open-folder=${two}`]);
    await page.getByTestId("app-shell").waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Workspace: Two" }).click();
    const list = page.getByTestId("workspace-list");
    await expect(
      list.getByRole("button", { name: /^Two/ }).getAttribute("aria-current"),
    ).resolves.toBe("true");
    await list.getByTestId("open-folder").waitFor();

    const opened = app!.waitForEvent("window");
    await list.getByRole("button", { name: /^One/ }).click();
    const next = await opened;
    await next.getByTestId("app-shell").waitFor({ timeout: 30_000 });
    expect(await scopeOf(next)).toMatchObject({ kind: "local", folder: { id: one } });
    expect(
      await poll(
        async () => app!.windows().length,
        (n) => n === 1,
      ),
    ).toBe(1);
    await quit();
  });
});
