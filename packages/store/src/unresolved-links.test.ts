// `unresolvedLinks` reads three sets through indexes; it must list what the plain query did.
import { afterEach, expect, test } from "bun:test";

import { queries } from "./queries.ts";
import { closeTestStores, openTestStore } from "./test-utils.ts";

afterEach(closeTestStores);

const WS = "ws";

// The query before it was split (every link of the workspace, joined twice).
const PLAIN = `SELECT s.id AS source_id, l.target_ref AS target_ref
  FROM links l
  JOIN documents s ON s.id = l.source_id
  LEFT JOIN documents t ON t.id = l.target_id
  WHERE l.workspace_id = ? AND s.deleted_at IS NULL
    AND (l.target_id IS NULL OR t.id IS NULL OR t.deleted_at IS NOT NULL)
  ORDER BY l.target_ref, s.title, s.id`;

test("lists links to nothing, to the trash and to an id no document has", async () => {
  const { store, runtime } = await openTestStore();
  await runtime.ops.doc.create({ workspaceId: WS, title: "Target" });
  const gone = await runtime.ops.doc.create({ workspaceId: WS, title: "Gone" });
  const source = await runtime.ops.doc.create({
    workspaceId: WS,
    title: "Source",
    markdown: "[[Target]] [[Missing]] [[Gone]]",
  });
  const trashed = await runtime.ops.doc.create({
    workspaceId: WS,
    title: "Trashed source",
    markdown: "[[Missing]]",
  });
  await runtime.ops.doc.create({ workspaceId: "other", title: "Elsewhere", markdown: "[[Nope]]" });
  await runtime.ops.doc.delete({ id: gone.id });
  await runtime.ops.doc.delete({ id: trashed.id });
  // A link whose target id names no document here (as a peer may sync it).
  await store.db.execute(
    `INSERT INTO links (id, workspace_id, source_id, target_id, target_ref, target_key, kind, syntax)
     VALUES (uuid(), ?, ?, '0193f0a4-0000-7000-8000-000000000000', 'Ghost', 'ghost', 'link', 'wikilink')`,
    [WS, source.id],
  );

  const rows = await store.query(queries.unresolvedLinks(WS));
  expect(rows.map((l) => [l.source.id, l.targetRef])).toEqual([
    [source.id, "Ghost"],
    [source.id, "Gone"],
    [source.id, "Missing"],
  ]);
  const plain = await store.db.getAll<{ source_id: string; target_ref: string }>(PLAIN, [WS]);
  expect(rows.map((l) => [l.source.id, l.targetRef])).toEqual(
    plain.map((r) => [r.source_id, r.target_ref]),
  );
});
