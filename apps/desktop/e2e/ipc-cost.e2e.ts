// Measures the cost of the service channel (renderer → preload → main → back), the number that
// decides where SQLite runs. Prints a table; asserts only generous upper bounds.
import { afterAll, beforeAll, expect, it } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { Platform } from "@lydie/platform";
import { _electron as electron } from "playwright-core";
import type { ElectronApplication, Page } from "playwright-core";

import { launchEnv } from "./env.ts";

const electronBinary = createRequire(import.meta.url)("electron") as string;
const mainScript = resolve(import.meta.dirname, "../out/main/index.js");

let base: string;
let app: ElectronApplication;
let page: Page;

beforeAll(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "lydie-ipc-")));
  app = await electron.launch({
    executablePath: electronBinary,
    args: [mainScript, "--diagnostics"],
    env: launchEnv({ LYDIE_USER_DATA: join(base, "user-data") }),
  });
  page = await app.firstWindow();
  await page.getByTestId("services").waitFor();
});

afterAll(async () => {
  await app?.close();
  await rm(base, { recursive: true, force: true });
});

it("measures request and stream costs", async () => {
  const result = await page.evaluate(async () => {
    const services = (window as unknown as { lydiePlatform: Platform }).lydiePlatform.services!;
    const time = async (runs: number, run: () => Promise<unknown>) => {
      for (let i = 0; i < 5; i++) await run();
      const start = performance.now();
      for (let i = 0; i < runs; i++) await run();
      return +((performance.now() - start) / runs).toFixed(3);
    };
    const rows = (count: number) => () => services.request("diagnostics", "rows", { count });
    const out: Record<string, number> = {
      echoMs: await time(500, () => services.request("diagnostics", "echo", { value: "x" })),
      rows100Ms: await time(100, rows(100)),
      rows1000Ms: await time(50, rows(1000)),
      rows10000Ms: await time(10, rows(10000)),
    };
    // Stream latency: main stamps each event, the renderer measures arrival (same clock).
    const delays: number[] = [];
    await new Promise<void>((done) => {
      const off = services.subscribe("diagnostics", "ticks", { intervalMs: 10 }, (event) => {
        delays.push(Date.now() - (event as { sentAt: number }).sentAt);
        if (delays.length === 100) {
          off();
          done();
        }
      });
    });
    delays.sort((a, b) => a - b);
    out.streamP50Ms = delays[50]!;
    out.streamP99Ms = delays[98]!;
    return out;
  });
  process.stderr.write(`IPC cost: ${JSON.stringify(result)}\n`);
  expect(result.echoMs).toBeLessThan(20);
  expect(result.rows1000Ms).toBeLessThan(200);
});
