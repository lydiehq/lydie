// Stress the browser store's storage (LYD-279): repeats a scenario and counts how often the
// database cannot be opened afterwards. Not part of `test:e2e`; run it by hand against a build:
//
//   bun run build:e2e
//   bun e2e/storage-stress.ts kill [runs] [outDir]       # kill the browser mid-write, reopen
//   bun e2e/storage-stress.ts two-pages [runs] [outDir]  # two pages open and write at once
//   bun e2e/storage-stress.ts low-disk [runs] [outDir]   # macOS: profile on a full disk image
//
// Chromium only (the kill finds the browser by its --user-data-dir). Failing profiles are kept and
// their paths printed.
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright";
import type { BrowserContext, Page } from "playwright";

import { startServer } from "./helpers.ts";

const [mode = "kill", runsArg = "20", outDir = ".e2e/main"] = process.argv.slice(2);
const runs = Number(runsArg);

type Outcome = "opened" | "failed";

async function openOutcome(page: Page, url: string): Promise<{ outcome: Outcome; text: string }> {
  await page.goto(url);
  return Promise.race([
    page
      .getByTestId("app-shell")
      .waitFor({ timeout: 45_000 })
      .then(() => ({ outcome: "opened" as const, text: "" })),
    page
      .getByRole("alert")
      .filter({ hasText: "could not open" })
      .waitFor({ timeout: 45_000 })
      .then(async () => ({
        outcome: "failed" as const,
        text: await page.getByRole("alert").first().innerText(),
      })),
  ]);
}

// Writes documents in a loop until the page goes away (each is its own write transaction).
function startWriting(page: Page) {
  void page
    .evaluate(async () => {
      const lydie = (window as unknown as { __lydie: { host: { backend: any } } }).__lydie;
      const ws = JSON.parse(localStorage.getItem("lydie:local-workspace")!).id as string;
      for (let i = 0; ; i++) {
        await lydie.host.backend.execute("doc.create", {
          workspaceId: ws,
          title: `Stress ${i}`,
          markdown: `# Stress ${i}\n\n${"Lorem ipsum dolor sit amet. ".repeat(2000)}`,
        });
      }
    })
    .catch(() => {});
}

function launch(dir: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(dir, { viewport: { width: 1200, height: 800 } });
}

async function killRun(url: string, dir: string): Promise<{ outcome: Outcome; text: string }> {
  let context = await launch(dir);
  let page = await context.newPage();
  const first = await openOutcome(page, url);
  if (first.outcome === "failed") return first;
  startWriting(page);
  await Bun.sleep(300 + Math.random() * 1500);
  // SIGKILL every process of this browser: no chance to finish the transaction or close files.
  execSync(`pkill -9 -f -- "--user-data-dir=${dir}" || true`);
  await context.close().catch(() => {});
  context = await launch(dir);
  page = await context.newPage();
  const result = await openOutcome(page, url);
  await context.close();
  return result;
}

async function twoPagesRun(url: string, dir: string): Promise<{ outcome: Outcome; text: string }> {
  const context = await launch(dir);
  try {
    const [a, b] = [await context.newPage(), await context.newPage()];
    const results = await Promise.all([openOutcome(a, url), openOutcome(b, url)]);
    const failed = results.find((r) => r.outcome === "failed");
    if (failed) return failed;
    startWriting(a);
    startWriting(b);
    await Bun.sleep(1500);
    await b.close();
    return await openOutcome(a, url);
  } finally {
    await context.close();
  }
}

// macOS: the profile lives on a 300 MB disk image that is filled to the brim while the app writes.
// Then the space is freed again and the app must open.
async function lowDiskRun(url: string): Promise<{ outcome: Outcome; text: string }> {
  const work = mkdtempSync(join(tmpdir(), "lydie-lowdisk-"));
  const image = join(work, "vol.dmg");
  execSync(`hdiutil create -size 300m -fs APFS -volname lydie-stress "${image}"`, {
    stdio: "ignore",
  });
  const attach = execSync(`hdiutil attach -nobrowse "${image}"`).toString();
  const mount = attach.trim().split("\n").at(-1)!.split("\t").at(-1)!.trim();
  try {
    const profile = join(mount, "profile");
    mkdirSync(profile);
    let context = await launch(profile);
    let page = await context.newPage();
    const first = await openOutcome(page, url);
    if (first.outcome === "failed") return first;
    const filler = join(mount, "filler");
    mkdirSync(filler);
    for (let i = 0; ; i++) {
      try {
        execSync(`dd if=/dev/zero of="${filler}/${i}" bs=1m count=1 2>/dev/null`);
      } catch {
        execSync(`rm -f "${filler}/${i}"`);
        break;
      }
    }
    startWriting(page);
    await Bun.sleep(3000);
    await context.close();
    rmSync(filler, { recursive: true, force: true });
    context = await launch(profile);
    page = await context.newPage();
    const result = await openOutcome(page, url);
    await context.close();
    return result;
  } finally {
    execSync(`hdiutil detach "${mount}" -force`, { stdio: "ignore" });
    rmSync(work, { recursive: true, force: true });
  }
}

const server = await startServer(undefined, outDir);
let failures = 0;
try {
  for (let run = 1; run <= runs; run++) {
    const dir = mkdtempSync(join(tmpdir(), `lydie-stress-${mode}-`));
    const result =
      mode === "kill"
        ? await killRun(server.url, dir)
        : mode === "two-pages"
          ? await twoPagesRun(server.url, dir)
          : await lowDiskRun(server.url);
    if (result.outcome === "failed") {
      failures++;
      console.log(`run ${run}: FAILED (${result.text.replaceAll("\n", " ")}) profile kept: ${dir}`);
    } else {
      console.log(`run ${run}: opened`);
      rmSync(dir, { recursive: true, force: true });
    }
  }
} finally {
  await server.stop();
}
console.log(`${mode}: ${failures} of ${runs} runs left a database that could not be opened`);
