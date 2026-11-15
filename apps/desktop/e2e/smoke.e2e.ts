// Launches the built app on the diagnostic page with a temp folder and drives it through the
// renderer, checking the effects on disk and the watcher events coming back.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { Platform } from "@lydie/platform";
import { _electron as electron } from "playwright-core";
import type { ElectronApplication, Page } from "playwright-core";

import { launchEnv } from "./env.ts";
import { poll } from "./poll.ts";

// The "electron" package exports the binary path (and downloads the binary on first use).
const electronBinary = createRequire(import.meta.url)("electron") as string;
const mainScript = resolve(import.meta.dirname, "../out/main/index.js");

declare global {
  interface Window {
    lydiePlatform: Platform;
  }
}

let base: string;
let folder: string;
let app: ElectronApplication;
let page: Page;

beforeAll(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "lydie-e2e-")));
  folder = join(base, "vault");
  await mkdir(join(folder, "notes"), { recursive: true });
  await mkdir(join(base, "outside"));
  await writeFile(join(base, "outside", "secret.txt"), "secret");
  await symlink(join(base, "outside"), join(folder, "escape"));

  app = await electron.launch({
    executablePath: electronBinary,
    args: [mainScript, "--diagnostics", `--open-folder=${folder}`],
    env: launchEnv({ LYDIE_USER_DATA: join(base, "user-data") }),
  });
  page = await app.firstWindow();
  await page.getByTestId("files").waitFor();
});

afterAll(async () => {
  await app?.close();
  await rm(base, { recursive: true, force: true });
});

describe("desktop smoke", () => {
  it("binds the window to the folder and isolates the page", async () => {
    expect(page.url()).toBe("lydie-app://diagnostics/diagnostics.html");
    const scope = JSON.parse((await page.getByTestId("scope").textContent()) ?? "{}");
    expect(scope).toMatchObject({ kind: "local", folder: { id: folder, path: folder } });
    const globals = await page.evaluate(() => ({
      require: typeof (globalThis as Record<string, unknown>).require,
      process: typeof (globalThis as Record<string, unknown>).process,
      kind: window.lydiePlatform.capabilities.kind,
    }));
    expect(globals).toEqual({ require: "undefined", process: "undefined", kind: "desktop" });

    // The scope is fixed for the window: the page cannot swap it, and the main process holds
    // its own copy anyway.
    const scopeAfterTampering = await page.evaluate(() => {
      const platform = window.lydiePlatform as unknown as Record<string, unknown>;
      try {
        platform.scope = { kind: "none" };
      } catch {
        // Frozen in strict mode.
      }
      try {
        (platform.scope as Record<string, unknown>).kind = "none";
      } catch {
        // Frozen in strict mode.
      }
      return window.lydiePlatform.scope.kind;
    });
    expect(scopeAfterTampering).toBe("local");
  });

  it("writes a file from the renderer and sees disk edits through the watcher", async () => {
    await page.getByTestId("watch-toggle").click();
    const status = page.getByTestId("watch-status");
    expect(
      await poll(
        () => status.textContent(),
        (text) => text === "watching",
      ),
    ).toBe("watching");

    await page.getByTestId("file-path").fill("notes/hello.md");
    await page.getByTestId("file-content").fill("# Hello from the renderer\n");
    await page.getByTestId("write-file").click();
    await page.getByTestId("file-status").waitFor();
    expect(await readFile(join(folder, "notes", "hello.md"), "utf8")).toBe(
      "# Hello from the renderer\n",
    );

    // Give FSEvents a moment so the external edit lands in its own batch.
    await page.waitForTimeout(300);
    await writeFile(join(folder, "notes", "hello.md"), "# Edited on disk\n");
    await writeFile(join(folder, "notes", "external.md"), "new");
    const log = () => page.getByTestId("watch-log").textContent();
    const logged = (pattern: RegExp) => poll(log, (text) => pattern.test(text ?? ""), 10_000);
    const external = /(create|update) notes\/external\.md/;
    expect(await logged(external)).toMatch(external);
    const hello = /update notes\/hello\.md/;
    expect(await logged(hello)).toMatch(hello);

    await page.getByTestId("read-file").click();
    const content = page.getByTestId("file-content");
    const reread = await poll(
      () => content.inputValue(),
      (value) => value === "# Edited on disk\n",
    );
    expect(reread).toBe("# Edited on disk\n");
  });

  it("confines file access to the folder", async () => {
    const errors = await page.evaluate(async () => {
      const files = window.lydiePlatform.files!;
      const attempt = (run: () => Promise<unknown>) =>
        run().then(
          () => "ok",
          (error: Error) => error.message,
        );
      return {
        dotdot: await attempt(() => files.readText("../outside/secret.txt")),
        absolute: await attempt(() => files.readText("/etc/passwd")),
        symlink: await attempt(() => files.readText("escape/secret.txt")),
        badArgument: await attempt(() => files.readText(42 as unknown as string)),
        openUngranted: await attempt(() =>
          window.lydiePlatform.windows.open({
            scope: { kind: "local", folder: { id: "/", name: "root" } },
          }),
        ),
        external: await attempt(() => window.lydiePlatform.openExternal("file:///etc/passwd")),
      };
    });
    expect(errors.dotdot).toContain("[lydie:invalid-path]");
    expect(errors.absolute).toContain("[lydie:invalid-path]");
    expect(errors.symlink).toContain("[lydie:outside-workspace]");
    expect(errors.badArgument).toContain("[lydie:invalid-argument]");
    expect(errors.openUngranted).toContain("[lydie:permission-denied]");
    expect(errors.external).toContain("[lydie:invalid-argument]");
  });

  it("round-trips bytes and reaches main-process services", async () => {
    const result = await page.evaluate(async () => {
      const platform = window.lydiePlatform;
      await platform.files!.writeBytes("bin.dat", new Uint8Array([0, 1, 254, 255]));
      const bytes = await platform.files!.readBytes("bin.dat");
      const echo = (await platform.services!.request("diagnostics", "echo", {
        value: "ping",
      })) as { value: string };
      const tick = await new Promise<unknown>((resolve) => {
        const off = platform.services!.subscribe(
          "diagnostics",
          "ticks",
          { intervalMs: 20 },
          (event) => {
            off();
            resolve(event);
          },
        );
      });
      return { bytes: [...bytes], isUint8: bytes instanceof Uint8Array, echo: echo.value, tick };
    });
    expect(result).toMatchObject({ bytes: [0, 1, 254, 255], isUint8: true, echo: "ping" });
    expect(result.tick).toMatchObject({ n: 0 });
  });

  it("blocks navigation away from the app and window.open", async () => {
    const before = page.url();
    // Non-web URLs, so the denied attempts are not handed to the system browser either.
    await page.evaluate(() => {
      window.open("about:blank");
    });
    expect(app.windows()).toHaveLength(1);
    await page
      .evaluate(() => {
        window.location.href = "lydie-app://elsewhere/index.html";
      })
      .catch(() => {});
    await page.waitForTimeout(300);
    expect(page.url()).toBe(before);
  });

  it("registers global shortcuts for the window and releases them on reload", async () => {
    const accelerator = "CommandOrControl+Alt+Shift+F19";
    const held = () =>
      app.evaluate(({ globalShortcut }, a) => globalShortcut.isRegistered(a), accelerator);
    const result = await page.evaluate(async (a) => {
      const shortcuts = window.lydiePlatform.shortcuts!;
      return {
        capability: window.lydiePlatform.capabilities.globalShortcuts,
        first: await shortcuts.register(a, () => {}),
        again: await shortcuts.register(a, () => {}),
        bad: await shortcuts.register("Space", () => {}).catch((e: Error) => e.message),
      };
    }, accelerator);
    expect(result).toMatchObject({ capability: true, first: true, again: false });
    expect(result.bad).toContain("[lydie:invalid-argument]");
    expect(await held()).toBe(true);
    await page.reload();
    await page.getByTestId("files").waitFor();
    expect(await poll(held, (h) => h === false)).toBe(false);
  });

  it("opens a second window on the same folder with a route", async () => {
    const route = { kind: "doc", id: "01928000-0000-0000-0000-000000000000" };
    const opened = app.waitForEvent("window");
    await page.evaluate(
      (r) => window.lydiePlatform.windows.open({ scope: window.lydiePlatform.scope, route: r }),
      route,
    );
    const second = await opened;
    await second.getByTestId("files").waitFor();
    const seen = await second.evaluate(() => ({
      route: window.lydiePlatform.windows.initialRoute,
      scope: window.lydiePlatform.scope.kind,
    }));
    expect(seen).toEqual({ route, scope: "local" });
    expect(await page.evaluate(() => window.lydiePlatform.windows.initialRoute)).toBeNull();
    expect(app.windows()).toHaveLength(2);
    await second.close();
  });
});
