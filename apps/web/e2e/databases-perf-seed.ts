// Helpers for `databases-perf.e2e.ts`: a 10,000-row × 40-column database seeded from the page (once
// per profile), and a React DevTools hook that counts which components rendered in a commit.
import type { Page } from "playwright";

export const GRID_TITLE = "Grid 10k v2";
export const GRID_ROWS = 10_000;
// After the title: 36 stored columns cycling these types, then a relation, a rollup and a formula.
export const GRID_TYPES = ["number", "text", "select", "checkbox", "date", "url"] as const;
export const GRID_OPTIONS = ["red", "green", "blue", "amber"];

// Seeds the database in the bench workspace unless it exists; returns its id.
export async function seedGrid(page: Page): Promise<string> {
  return page.evaluate(
    async ({ title, rows, types, options }) => {
      const { host } = (window as any).__lydie;
      const backend = host.backend;
      const workspaceId = "bench";
      const list = await backend.query("database.list", { workspaceId });
      const existing = list.find((d: { title: string }) => d.title === title);
      if (existing) return existing.id as string;
      const projects = list.find((d: { title: string }) => d.title === "Projects");
      const projectsDef = (await backend.query("database.get", { id: projects.id }))[0];
      const budget = projectsDef.properties.find((p: { key: string }) => p.key === "budget");
      const projectRows = (
        await backend.query("database.view", {
          databaseId: projects.id,
          window: { offset: 0, limit: 1000 },
        })
      )
        .filter((i: { kind: string }) => i.kind === "row")
        .map((i: { row: { id: string } }) => i.row.id);
      let id = "";
      const keys: { key: string; type: string }[] = [];
      await backend.transaction(
        "Seed grid",
        async (ops: any) => {
          const created = await ops.database.create({ workspaceId, title });
          id = created.database.id;
          for (let i = 0; i < 36; i++) {
            const type = types[i % types.length]!;
            const key = `c${i}`;
            await ops.database.addProperty({
              databaseId: id,
              name: `${type} ${i}`,
              key,
              type,
              config: type === "select" ? { options: options.map((name) => ({ name })) } : {},
            });
            keys.push({ key, type });
          }
          const relation = await ops.database.addProperty({
            databaseId: id,
            name: "Project",
            key: "project",
            type: "relation",
            config: { relation: { databaseId: projects.id, twoWay: false, limit: "one" } },
          });
          await ops.database.addProperty({
            databaseId: id,
            name: "Budget",
            key: "budget",
            type: "rollup",
            config: {
              rollup: {
                relationPropertyId: relation.id,
                targetPropertyId: budget.id,
                function: "sum",
              },
            },
          });
          await ops.database.addProperty({
            databaseId: id,
            name: "Double",
            key: "double",
            type: "formula",
            config: { expression: "if(c0, c0 * 2, 0)" },
          });
        },
        { history: false },
      );
      // mulberry32: deterministic and stays in 32-bit integers.
      let seed = 7;
      const rand = (n: number) => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) % n;
      };
      const valueFor = (type: string, i: number) => {
        switch (type) {
          case "number":
            return rand(1000);
          case "text":
            return `text ${i} ${rand(100000)}`;
          case "select":
            return options[rand(options.length)];
          case "checkbox":
            return rand(2) === 1;
          case "date":
            return `2026-${String(1 + rand(12)).padStart(2, "0")}-${String(1 + rand(28)).padStart(2, "0")}`;
          default:
            return `https://example.com/${i}`;
        }
      };
      for (let start = 0; start < rows; start += 500) {
        await backend.transaction(
          "Seed grid rows",
          async (ops: any) => {
            for (let i = start; i < Math.min(rows, start + 500); i++) {
              const properties: Record<string, unknown> = {};
              for (const { key, type } of keys) properties[key] = valueFor(type, i);
              if (projectRows.length && rand(10) < 8)
                properties.project = [projectRows[rand(projectRows.length)]];
              await ops.doc.create({
                workspaceId,
                parentId: id,
                title: `Row ${i + 1}`,
                properties,
              });
            }
          },
          { history: false },
        );
      }
      return id;
    },
    { title: GRID_TITLE, rows: GRID_ROWS, types: [...GRID_TYPES], options: GRID_OPTIONS },
  );
}

// Installed before the app loads (`context.addInitScript`). While `__renders.on`, every commit
// adds the function components that rendered in it, by the ARIA role of their first DOM element.
export function installRenderCounter() {
  const w = window as any;
  const counts: Record<string, number> = {};
  w.__renders = { on: false, counts };
  let nextId = 0;
  const hostRole = (fiber: any): string => {
    let f = fiber;
    while (f && f.tag !== 5) f = f.child;
    const el = f?.stateNode as Element | undefined;
    return el?.getAttribute?.("role") ?? el?.getAttribute?.("data-grid-layer") ?? "other";
  };
  const isComponent = (tag: number) =>
    tag === 0 || tag === 1 || tag === 11 || tag === 14 || tag === 15;
  const add = (fiber: any) => {
    const role = hostRole(fiber);
    counts[role] = (counts[role] ?? 0) + 1;
  };
  const mountAll = (fiber: any) => {
    for (let f = fiber; f; f = f.sibling) {
      if (isComponent(f.tag)) add(f);
      if (f.child) mountAll(f.child);
    }
  };
  const walk = (next: any) => {
    const prev = next.alternate;
    if (!prev) {
      if (isComponent(next.tag)) add(next);
      if (next.child) mountAll(next.child);
      return;
    }
    if (isComponent(next.tag) && (next.flags & 1) === 1) add(next);
    // A bailed-out subtree keeps the previous commit's children.
    if (next.child === prev.child) return;
    for (let c = next.child; c; c = c.sibling) walk(c);
  };
  w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(renderer: unknown) {
      this.renderers.set(++nextId, renderer);
      return nextId;
    },
    onScheduleFiberRoot() {},
    onCommitFiberRoot(_id: number, root: any) {
      if (!w.__renders.on) return;
      for (let c = root.current.child; c; c = c.sibling) walk(c);
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
  };
}
