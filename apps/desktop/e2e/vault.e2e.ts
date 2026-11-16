// The data layer in the Electron main process, driven from the renderer through the services
// channel: operations reach the folder, edits on disk reach live queries, renames on disk keep ids.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { Platform } from "@lydie/platform";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { _electron as electron } from "playwright-core";
import type { ElectronApplication, Page } from "playwright-core";

import { launchEnv } from "./env.ts";
import { poll } from "./poll.ts";

const electronBinary = createRequire(import.meta.url)("electron") as string;
const mainScript = resolve(import.meta.dirname, "../out/main/index.js");

declare global {
  interface Window {
    lydiePlatform: Platform;
    vaultTest: { rows: Record<string, unknown>[]; events: number };
  }
}

let base: string;
let folder: string;
let app: ElectronApplication;
let page: Page;
let workspaceId: string;

type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };

async function execute<T>(id: string, input: unknown): Promise<T> {
  const result = (await page.evaluate(
    ([id, input]) =>
      window.lydiePlatform.services!.request("lydie-backend", "execute", { id, input }),
    [id, input] as const,
  )) as Result<T>;
  if (!result.ok) throw new Error(`${id}: ${result.error.message}`);
  return result.value;
}

beforeAll(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "lydie-e2e-vault-")));
  folder = join(base, "vault");
  await mkdir(join(folder, "Projects"), { recursive: true });
  await writeFile(join(folder, "Home.md"), "# Home\n\nSee [[Plan]].\n");
  await writeFile(join(folder, "Projects/Plan.md"), "---\nstatus: draft\n---\nThe plan.\n");

  app = await electron.launch({
    executablePath: electronBinary,
    args: [mainScript, "--diagnostics", `--open-folder=${folder}`],
    env: launchEnv({ LYDIE_USER_DATA: join(base, "user-data") }),
  });
  page = await app.firstWindow();
  await page.getByTestId("files").waitFor();
  const info = (await page.evaluate(() =>
    window.lydiePlatform.services!.request("lydie-backend", "info", null),
  )) as { workspaceId: string; mode: string };
  workspaceId = info.workspaceId;
});

afterAll(async () => {
  await app?.close();
  await rm(base, { recursive: true, force: true });
});

describe("vault in the main process", () => {
  it("indexes the folder, with the database outside it", async () => {
    // The window is served while the folder is indexed (`acquireServing`).
    const status = await poll(
      async () =>
        (await page.evaluate(() =>
          window.lydiePlatform.services!.request("lydie-vault", "status", null),
        )) as { state: string; documents: number },
      (s) => s.state === "ready",
    );
    expect(status).toMatchObject({ state: "ready", documents: 3 });
    const tree = await execute<{ entries: { title: string; depth: number }[] }>("doc.listTree", {
      workspaceId,
    });
    expect(tree.entries.map((e) => `${e.depth}:${e.title}`)).toEqual([
      "0:Home",
      "0:Projects",
      "1:Plan",
    ]);
  });

  it("runs operations and writes the files", async () => {
    const doc = await execute<{ id: string }>("doc.create", {
      workspaceId,
      title: "Written from the renderer",
      markdown: "Body\n",
    });
    expect(await readFile(join(folder, "Written from the renderer.md"), "utf8")).toBe(
      `---\nid: ${doc.id}\n---\nBody\n`,
    );
    const plan = (
      await execute<{ entries: { id: string; title: string }[] }>("doc.listTree", { workspaceId })
    ).entries.find((e) => e.title === "Plan")!;
    await execute("doc.setProperties", { id: plan.id, set: { status: "done" } });
    expect(await readFile(join(folder, "Projects/Plan.md"), "utf8")).toBe(
      "---\nstatus: done\n---\nThe plan.\n",
    );
  });

  it("updates live queries when a file changes on disk", async () => {
    await page.evaluate((workspaceId) => {
      window.vaultTest = { rows: [], events: 0 };
      window.lydiePlatform.services!.subscribe(
        "lydie-backend",
        "live",
        { name: "doc.children", params: { workspaceId, parentId: null } },
        (raw) => {
          const event = raw as { t: string; rows?: ({ v: unknown } | [number, number])[] };
          const previous = window.vaultTest.rows;
          if (event.rows) {
            window.vaultTest.rows = event.rows.flatMap((segment) =>
              Array.isArray(segment)
                ? previous.slice(segment[0], segment[0] + segment[1])
                : [segment.v as Record<string, unknown>],
            );
          }
          window.vaultTest.events++;
        },
      );
    }, workspaceId);
    const titles = () => page.evaluate(() => window.vaultTest.rows.map((r) => r.title as string));
    await poll(titles, (t) => t.includes("Home"));

    await writeFile(join(folder, "Dropped in.md"), "from another program\n");
    expect(await poll(titles, (t) => t.includes("Dropped in"))).toContain("Dropped in");
  });

  it("keeps the id when a file is renamed on disk", async () => {
    const before = (
      await execute<{ entries: { id: string; title: string }[] }>("doc.listTree", { workspaceId })
    ).entries.find((e) => e.title === "Home")!;
    await rename(join(folder, "Home.md"), join(folder, "Start.md"));
    const after = await poll(
      async () =>
        (await execute<{ document: { title: string } }>("doc.get", { id: before.id })).document
          .title,
      (title) => title === "Start",
    );
    expect(after).toBe("Start");
  });

  it("serves the vault over MCP when turned on", async () => {
    const status = (await page.evaluate(() =>
      window.lydiePlatform.services!.request("lydie-vault", "mcpSetEnabled", { enabled: true }),
    )) as { running: boolean; url: string; tokenPath: string };
    expect(status.running).toBe(true);
    expect(status.tokenPath.startsWith(join(base, "user-data"))).toBe(true);
    const token = (await readFile(status.tokenPath, "utf8")).trim();
    const client = new Client({ name: "e2e-agent", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(status.url), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    );
    try {
      const result = await client.callTool({
        name: "create_doc",
        arguments: { workspaceId, title: "From an agent", markdown: "Hi from MCP.\n" },
      });
      expect(result.isError).toBeFalsy();
      expect(await readFile(join(folder, "From an agent.md"), "utf8")).toContain("Hi from MCP.\n");
    } finally {
      await client.close();
    }
    const off = (await page.evaluate(() =>
      window.lydiePlatform.services!.request("lydie-vault", "mcpSetEnabled", { enabled: false }),
    )) as { running: boolean };
    expect(off.running).toBe(false);
  });
});
