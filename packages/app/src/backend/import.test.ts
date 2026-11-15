// `runImport` (@lydie/plugin-api) against a real local backend: pages, links, collections with
// typed properties, relations, files and their names.
import { afterEach, expect, test } from "bun:test";

import {
  importDatabaseEmbed,
  importFileRef,
  importLink,
  newImportId,
  runImport,
} from "@lydie/plugin-api";
import type { Backend, ImportPlan } from "@lydie/plugin-api";
import { createRuntime } from "@lydie/runtime";
import { createMemoryPorts } from "@lydie/runtime/memory";
import { openNodeStore } from "@lydie/store/node";

import { createEventHub, createLocalBackend } from "./local.ts";
import { handledOperations } from "./registry.ts";

const WS = "01973200-0000-0000-0000-000000000000";
const cleanup: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

async function open(): Promise<Backend> {
  const tmp = process.env.TMPDIR ?? "/tmp";
  const path = `${tmp.replace(/\/$/, "")}/lydie-import-${crypto.randomUUID()}.sqlite`;
  const store = await openNodeStore({ path });
  const hub = createEventHub();
  const { blob } = createMemoryPorts();
  const runtime = createRuntime({
    registry: handledOperations(),
    ...store.ports,
    blob,
    events: hub.port,
    actor: { type: "user", id: "u1" },
  });
  const backend = createLocalBackend({
    store,
    runtime,
    blob,
    events: hub,
    info: { workspaceId: WS, workspaceName: "Test", persistent: true },
    lingerMs: 0,
  });
  cleanup.push(async () => {
    await backend.close();
    await store.close();
    for (const suffix of ["", "-wal", "-shm"])
      await Bun.file(path + suffix)
        .delete()
        .catch(() => {});
  });
  return backend;
}

function plan() {
  const ids = {
    notes: newImportId(),
    plan: newImportId(),
    untitledA: newImportId(),
    untitledB: newImportId(),
    tasks: newImportId(),
    write: newImportId(),
    ship: newImportId(),
    projects: newImportId(),
    lydie: newImportId(),
    status: newImportId(),
    project: newImportId(),
    estimate: newImportId(),
    due: newImportId(),
    files: newImportId(),
    photo: newImportId(),
    spec: newImportId(),
  };
  const value: ImportPlan = {
    rootTitle: "Notion",
    pages: [
      {
        id: ids.notes,
        parentId: null,
        title: "Notes",
        properties: { icon: "📒", cover: importFileRef(ids.photo) },
        markdown:
          `See [[${importLink(ids.plan)}|the plan]] and [[${importLink(ids.untitledB)}|Untitled]].\n\n` +
          `![[${importFileRef(ids.photo)}]]\n\n![[${importDatabaseEmbed(ids.tasks)}]]\n`,
      },
      { id: ids.plan, parentId: ids.notes, title: "Plan", markdown: "The plan.\n" },
      { id: ids.untitledA, parentId: ids.notes, title: "Untitled", markdown: "" },
      { id: ids.untitledB, parentId: ids.notes, title: "Untitled", markdown: "Second.\n" },
      {
        id: ids.projects,
        parentId: null,
        title: "Projects",
        markdown: "",
        database: { titleName: "Project", properties: [] },
      },
      { id: ids.lydie, parentId: ids.projects, title: "Lydie", markdown: "" },
      {
        id: ids.tasks,
        parentId: ids.notes,
        title: "Tasks",
        markdown: "",
        database: {
          titleName: "Task",
          properties: [
            {
              id: ids.status,
              name: "Status",
              type: "status",
              config: {
                options: [
                  { name: "Not started", color: "gray", group: "todo" },
                  { name: "Done", color: "green", group: "complete" },
                ],
              },
            },
            {
              id: ids.project,
              name: "Project",
              type: "relation",
              config: { relation: { databaseId: ids.projects } },
            },
            {
              id: ids.estimate,
              name: "Estimate",
              type: "number",
              config: { numberFormat: "currency", currency: "USD" },
            },
            { id: ids.due, name: "Due", type: "date", config: { includeTime: true } },
            { id: ids.files, name: "Files", type: "files" },
          ],
        },
      },
      {
        id: ids.write,
        parentId: ids.tasks,
        title: "Write it",
        markdown: "Body of a row.\n",
        values: {
          [ids.status]: "Done",
          [ids.project]: [ids.lydie],
          [ids.estimate]: 120.5,
          [ids.due]: "2026-11-12T15:00",
          [ids.files]: [importFileRef(ids.spec), "https://example.com/a.pdf"],
        },
      },
      {
        id: ids.ship,
        parentId: ids.tasks,
        title: "Ship it",
        markdown: "",
        // Not an option: the database adds it.
        values: { [ids.status]: "Blocked", [ids.estimate]: 3 },
      },
    ],
    files: [
      {
        id: ids.photo,
        name: "photo.png",
        contentType: "image/png",
        pageId: ids.notes,
        size: 3,
        read: async () => new Uint8Array([1, 2, 3]),
      },
      {
        id: ids.spec,
        name: "spec.pdf",
        contentType: "application/pdf",
        pageId: ids.write,
        size: 1,
        read: async () => new Uint8Array([4]),
      },
    ],
    warnings: [{ message: "Something did not carry over.", source: "Notes" }],
  };
  return { ids, plan: value };
}

test("writes pages, links, collections, values and files", async () => {
  const backend = await open();
  // Taken names: the root page and a file get a number.
  await backend.ops.doc.create({ workspaceId: WS, title: "Notion" });
  await backend.attachments.add({
    workspaceId: WS,
    filename: "photo.png",
    contentType: "image/png",
    data: new Uint8Array([9]),
  });
  const { ids, plan: input } = plan();
  const phases = new Set<string>();
  const result = await runImport({ backend, workspace: backend.info }, input, {
    onProgress: (p) => phases.add(p.phase),
  });

  expect(result.rootTitle).toBe("Notion 2");
  expect(result).toMatchObject({
    pages: 9,
    databases: 2,
    files: 2,
    failedFiles: [],
    stopped: false,
  });
  expect(result.warnings).toEqual(input.warnings);
  expect([...phases]).toEqual(["pages", "databases", "bodies", "files", "values"]);

  const [root] = await backend.query("doc.get", { id: result.rootId });
  expect(root?.document).toMatchObject({ title: "Notion 2", parentId: null });
  const top = await backend.query("doc.children", { workspaceId: WS, parentId: result.rootId });
  expect(top.map((d) => d.title)).toEqual(["Notes", "Projects"]);

  const [notes] = await backend.query("doc.get", { id: ids.notes, includeBody: true });
  expect(notes?.document.properties).toEqual({ icon: "📒", cover: "photo 2.png" });
  // A unique path links by path; two "Untitled" pages side by side by id.
  expect(notes?.body?.markdown).toBe(
    `See [[Notion 2/Notes/Plan|the plan]] and [[${ids.untitledB}|Untitled]].\n\n` +
      "![[photo 2.png]]\n\n![[Notion 2/Notes/Tasks.base]]\n",
  );
  const links = await backend.query("doc.links", { id: ids.notes });
  const targets = links.filter((l) => l.kind === "link").map((l) => l.target?.id);
  expect(targets).toEqual([ids.plan, ids.untitledB]);

  const [tasks] = await backend.query("database.get", { id: ids.tasks });
  const byName = new Map(tasks!.properties.map((p) => [p.name, p]));
  expect([...byName.keys()]).toEqual(["Task", "Status", "Project", "Estimate", "Due", "Files"]);
  expect(byName.get("Status")?.config.options?.map((o) => [o.name, o.color])).toEqual([
    ["Not started", "gray"],
    ["Done", "green"],
    // A value that was not an option becomes one, coloured by the collection.
    ["Blocked", expect.any(String)],
  ]);
  expect(byName.get("Project")?.config.relation?.databaseId).toBe(ids.projects);

  const [write] = await backend.query("doc.get", { id: ids.write, includeBody: true });
  const attachments = await backend.query("attachment.list", { workspaceId: WS });
  const spec = attachments.find((a) => a.filename === "spec.pdf");
  expect(spec?.documentId).toBe(ids.write);
  expect(write?.document.properties).toEqual({
    Status: "Done",
    Project: [ids.lydie],
    Estimate: 120.5,
    Due: "2026-11-12T15:00",
    Files: [spec!.id, "https://example.com/a.pdf"],
  });
  expect(write?.body?.markdown).toBe("Body of a row.\n");
  const [ship] = await backend.query("doc.get", { id: ids.ship });
  expect(ship?.document.properties).toEqual({ Status: "Blocked", Estimate: 3 });
});

test("stops between steps, keeping what was written", async () => {
  const backend = await open();
  const controller = new AbortController();
  const result = await runImport({ backend, workspace: backend.info }, plan().plan, {
    signal: controller.signal,
    onProgress: (p) => {
      if (p.phase === "databases") controller.abort();
    },
  });
  expect(result.stopped).toBe(true);
  expect(result.files).toBe(0);
  const top = await backend.query("doc.children", { workspaceId: WS, parentId: result.rootId });
  expect(top.map((d) => d.title)).toEqual(["Notes", "Projects"]);
});
