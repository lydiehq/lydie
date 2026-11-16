// Builds a large, realistic workspace through the runtime and store (the same path as real writes),
// deterministically: the same options always produce the same ids, titles, links and bodies.
import { uuidFromBits } from "@lydie/contract";
import type { Properties, PropertyConfigInput, PropertyType } from "@lydie/contract";
import { createRuntime } from "@lydie/runtime";
import type { Runtime } from "@lydie/runtime";
import type { Store } from "@lydie/store";

import { createRandom, longMarkdown, sentence, WORDS } from "./text.ts";

export { createRandom, longMarkdown } from "./text.ts";

export type SeedOptions = {
  workspaceId?: string;
  // Notes spread over nested folders, linking to each other.
  notes?: number;
  // Rows of the Tasks database (12 properties, five views).
  dbRows?: number;
  // Rows of the Projects database the tasks relate to (two-way).
  projectRows?: number;
  // Blocks in one long document.
  blocks?: number;
  // Short notes in one top-level "Big folder" (none by default), for the tree's virtualisation.
  bigFolder?: number;
  seed?: number;
  // Documents per transaction.
  batch?: number;
  onProgress?: (done: number, total: number) => void;
};

export type SeedResult = {
  workspaceId: string;
  folders: string[];
  notes: string[];
  // The Tasks database and its rows.
  databaseId: string;
  rows: string[];
  projectsId: string;
  projects: string[];
  // Property and view ids of the Tasks database, by name.
  properties: Record<string, string>;
  views: Record<string, string>;
  longDocId: string;
  // The "Big folder" (null without `bigFolder`).
  bigFolderId: string | null;
  // A note with many backlinks, for benchmarks.
  hubId: string;
  ms: { folders: number; notes: number; rows: number; longDoc: number; total: number };
  // The signed-in user the "Mine" view filters on.
  me: string;
};

// Deterministic ids (valid and sortable) and a clock that ticks 1 ms per call.
export function deterministicPorts(seed: number) {
  const random = createRandom(seed ^ 0x9e3779b9);
  let time = Date.parse("2026-01-01T00:00:00.000Z");
  return {
    clock: { now: () => new Date(++time) },
    ids: {
      uuid: () => {
        let bits = (BigInt(time) << 4n) | 7n;
        for (let i = 0; i < 19; i++) bits = (bits << 4n) | BigInt(random.int(16));
        return uuidFromBits(bits);
      },
    },
  };
}

export async function seedWorkspace(store: Store, options: SeedOptions = {}): Promise<SeedResult> {
  const workspaceId = options.workspaceId ?? "bench";
  const notes = options.notes ?? 10_000;
  const dbRows = options.dbRows ?? 5_000;
  const projectRows = options.projectRows ?? 1_000;
  const blocks = options.blocks ?? 2_000;
  const batch = options.batch ?? 500;
  const seed = options.seed ?? 1;
  const random = createRandom(seed);
  const runtime: Runtime = createRuntime({
    ...store.ports,
    actor: { type: "system", id: "seed" },
    ...deterministicPorts(seed),
  });
  const bigFolder = options.bigFolder ?? 0;
  const total = notes + dbRows + projectRows + 1 + bigFolder;
  let done = 0;
  const started = performance.now();
  const timed = async (fn: () => Promise<void>) => {
    const t = performance.now();
    await fn();
    return performance.now() - t;
  };

  // Folders: 20 top-level areas, each with 5 projects, each with 2 sub-folders (220 folders).
  const folders: string[] = [];
  const leafFolders: string[] = [];
  const foldersMs = await timed(() =>
    runtime.transaction(
      "Seed folders",
      async (ops) => {
        for (let a = 0; a < 20; a++) {
          const area = await ops.doc.create({
            workspaceId,
            title: `Area ${a + 1} ${random.words(1)}`,
          });
          folders.push(area.id);
          for (let p = 0; p < 5; p++) {
            const project = await ops.doc.create({
              workspaceId,
              parentId: area.id,
              title: `Project ${a + 1}.${p + 1}`,
            });
            folders.push(project.id);
            for (const name of ["Notes", "Archive"]) {
              const leaf = await ops.doc.create({ workspaceId, parentId: project.id, title: name });
              folders.push(leaf.id);
              leafFolders.push(leaf.id);
            }
          }
        }
      },
      { history: false },
    ),
  );

  // Notes: titles are unique so wikilinks resolve; each links to 0–4 earlier notes (and some to
  // the hub), some reference a block. Bodies are a few paragraphs.
  const noteIds: string[] = [];
  const titles: string[] = [];
  let hubId = "";
  const notesMs = await timed(async () => {
    for (let start = 0; start < notes; start += batch) {
      await runtime.transaction(
        "Seed notes",
        async (ops) => {
          for (let i = start; i < Math.min(notes, start + batch); i++) {
            const title = i === 0 ? "Hub" : `${random.words(2)} ${i}`;
            const links: string[] = [];
            const linkCount = i === 0 ? 0 : random.int(5);
            for (let l = 0; l < linkCount; l++)
              links.push(`[[${titles[random.int(titles.length)]}]]`);
            if (i > 0 && i % 7 === 0) links.push("[[Hub]]");
            if (i > 0 && i % 13 === 0) links.push(`[[${titles[random.int(titles.length)]}#^p1]]`);
            if (i % 97 === 0) links.push(`[[Missing note ${i}]]`);
            const markdown = [
              `# ${title}`,
              "",
              `${sentence(random, 25)} ^p1`,
              "",
              `${sentence(random, 30)} ${links.join(" ")}`,
              "",
              `- ${sentence(random, 8)}`,
              `- ${sentence(random, 8)}`,
              "",
            ].join("\n");
            const properties: Properties = {
              tags: [random.pick(WORDS), random.pick(WORDS)],
              status: random.pick(["idea", "draft", "review", "done"]),
              rating: random.int(5) + 1,
            };
            const doc = await ops.doc.create({
              workspaceId,
              parentId: random.next() < 0.1 ? null : random.pick(leafFolders),
              title,
              properties,
              markdown,
            });
            if (i === 0) hubId = doc.id;
            noteIds.push(doc.id);
            titles.push(title);
            done++;
          }
        },
        { history: false },
      );
      options.onProgress?.(done, total);
    }
  });

  // Two databases: Projects (budget, owner) and Tasks (12 properties incl. a two-way relation to
  // Projects, a rollup and a formula, five views). Rows are written with doc.create in batches
  // (the fast path a bulk import uses); the relation's other side with one bulk setValues.
  const rows: string[] = [];
  const projects: string[] = [];
  const properties: Record<string, string> = {};
  const views: Record<string, string> = {};
  let databaseId = "";
  let projectsId = "";
  const owners = ["ana", "ben", "chen", "dara", "eli"];
  const rowsMs = await timed(async () => {
    const tx = (label: string, fn: (ops: Runtime["ops"]) => Promise<void>) =>
      runtime.transaction(label, fn, { history: false });
    await tx("Seed databases", async (ops) => {
      const projectsDb = await ops.database.create({ workspaceId, title: "Projects" });
      projectsId = projectsDb.database.id;
      properties.budget = (
        await ops.database.addProperty({
          databaseId: projectsId,
          name: "Budget",
          type: "number",
          key: "budget",
        })
      ).id;
      const tasks = await ops.database.create({ workspaceId, title: "Tasks database" });
      databaseId = tasks.database.id;
      properties.title = tasks.properties[0]!.id;
      views.table = tasks.views[0]!.id;
      const add = async (
        name: string,
        key: string,
        type: PropertyType,
        config: PropertyConfigInput = {},
      ) =>
        (properties[key] = (
          await ops.database.addProperty({ databaseId, name, key, type, config })
        ).id);
      await add("Status", "status", "status", {
        options: [
          { name: "todo", color: "gray", group: "todo" },
          { name: "doing", color: "blue", group: "inProgress" },
          { name: "blocked", color: "red", group: "inProgress" },
          { name: "done", color: "green", group: "complete" },
        ],
      });
      await add("Priority", "priority", "number");
      await add("Estimate", "estimate", "number", { numberFormat: "number", decimals: 1 });
      await add("Due", "due", "date");
      await add("Done", "done", "checkbox");
      await add("Tags", "tags", "multiSelect", {
        options: [...new Set(WORDS)].slice(0, 20).map((name) => ({ name })),
      });
      await add("Owner", "owner", "person");
      await add("Link", "url", "url");
      await add("Notes", "notes", "text");
      const project = await ops.database.addProperty({
        databaseId,
        name: "Project",
        key: "project",
        type: "relation",
        reverseName: "Tasks",
        config: { relation: { databaseId: projectsId, twoWay: true, limit: "one" } },
      });
      properties.project = project.id;
      properties.tasks = project.config.relation!.reversePropertyId!;
      await add("Project budget", "project_budget", "rollup", {
        rollup: {
          relationPropertyId: project.id,
          targetPropertyId: properties.budget,
          function: "sum",
        },
      });
      await add("Cost", "cost", "formula", { expression: "if(estimate, estimate * 120, 0)" });
      await add("Created", "created", "createdTime");
      await ops.database.updateView({
        id: views.table,
        config: { sorts: [{ propertyId: properties.due!, direction: "asc" }] },
      });
      views.board = (
        await ops.database.createView({ databaseId, name: "Board", type: "board" })
      ).id;
      views.mine = (
        await ops.database.createView({
          databaseId,
          name: "My open tasks",
          type: "table",
          config: {
            filter: {
              type: "group",
              combinator: "and",
              children: [
                {
                  type: "condition",
                  propertyId: properties.owner!,
                  op: "contains",
                  value: { me: true },
                },
                { type: "condition", propertyId: properties.done!, op: "eq", value: false },
              ],
            },
            sorts: [
              { propertyId: properties.priority!, direction: "desc" },
              { propertyId: properties.due! },
            ],
            groupBy: { propertyId: properties.status!, direction: "asc" },
          },
        })
      ).id;
      views.calendar = (
        await ops.database.createView({ databaseId, name: "Calendar", type: "calendar" })
      ).id;
      views.byTag = (
        await ops.database.createView({
          databaseId,
          name: "By tag",
          type: "list",
          config: { groupBy: { propertyId: properties.tags!, direction: "asc" } },
        })
      ).id;
    });

    for (let start = 0; start < projectRows; start += batch) {
      await tx("Seed projects", async (ops) => {
        for (let i = start; i < Math.min(projectRows, start + batch); i++) {
          const row = await ops.doc.create({
            workspaceId,
            parentId: projectsId,
            title: `Project ${i + 1} ${random.words(2)}`,
            properties: { budget: 10 * (1 + random.int(100)) },
          });
          projects.push(row.id);
          done++;
        }
      });
      options.onProgress?.(done, total);
    }

    const reverse = new Map<string, string[]>();
    for (let start = 0; start < dbRows; start += batch) {
      await tx("Seed rows", async (ops) => {
        for (let i = start; i < Math.min(dbRows, start + batch); i++) {
          const day = 1 + random.int(28);
          const project = random.next() < 0.8 ? projects[random.int(projects.length)] : undefined;
          const row = await ops.doc.create({
            workspaceId,
            parentId: databaseId,
            title: `Task ${i + 1}: ${random.words(3)}`,
            properties: {
              status: random.pick(["todo", "doing", "blocked", "done"]),
              priority: random.int(4) + 1,
              estimate: Math.round(random.next() * 400) / 10,
              due: `2026-${String(1 + random.int(12)).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
              done: random.next() < 0.3,
              tags: [random.pick(WORDS)],
              owner: [random.pick(owners)],
              ...(random.next() < 0.3 ? { url: `https://example.com/${random.words(1)}` } : {}),
              notes: random.words(6),
              ...(project ? { project: [project] } : {}),
            },
          });
          if (project) reverse.set(project, [...(reverse.get(project) ?? []), row.id]);
          rows.push(row.id);
          done++;
        }
      });
      options.onProgress?.(done, total);
    }
    await tx("Seed relations", async (ops) => {
      await ops.database.setValues({
        databaseId: projectsId,
        exact: true,
        updates: [...reverse].map(([rowId, ids]) => ({ rowId, set: { [properties.tasks!]: ids } })),
      });
    });
  });

  let longDocId = "";
  const longDocMs = await timed(async () => {
    longDocId = (
      await runtime.execute(
        "doc.create",
        { workspaceId, title: "Long document", markdown: longMarkdown(blocks, seed) },
        { history: false },
      )
    ).id;
    done++;
  });
  options.onProgress?.(done, total);

  // Last, so everything above (and its ids) is the same with or without it.
  let bigFolderId: string | null = null;
  if (bigFolder > 0) {
    const tx = (fn: (ops: Runtime["ops"]) => Promise<void>) =>
      runtime.transaction("Seed big folder", fn, { history: false });
    await tx(async (ops) => {
      bigFolderId = (await ops.doc.create({ workspaceId, title: "Big folder" })).id;
    });
    for (let start = 0; start < bigFolder; start += batch) {
      await tx(async (ops) => {
        for (let i = start; i < Math.min(bigFolder, start + batch); i++) {
          await ops.doc.create({
            workspaceId,
            parentId: bigFolderId,
            title: `Filed ${random.words(1)} ${i + 1}`,
            markdown: `${sentence(random, 12)}\n`,
          });
          done++;
        }
      });
      options.onProgress?.(done, total);
    }
  }

  return {
    workspaceId,
    folders,
    notes: noteIds,
    databaseId,
    rows,
    projectsId,
    projects,
    properties,
    views,
    me: owners[0]!,
    longDocId,
    bigFolderId,
    hubId,
    ms: {
      folders: foldersMs,
      notes: notesMs,
      rows: rowsMs,
      longDoc: longDocMs,
      total: performance.now() - started,
    },
  };
}
