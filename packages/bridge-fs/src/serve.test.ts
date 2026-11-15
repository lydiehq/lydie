import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parse, schema } from "@lydie/markdown";
import { Slice } from "prosemirror-model";
import type { Node } from "prosemirror-model";
import { Transform } from "prosemirror-transform";

import { serveVault } from "./serve.ts";
import type { DocumentEvent, VaultStatus } from "./service.ts";
import { cleanup, fixtureVault, openTestVault } from "./test-utils.ts";

afterEach(cleanup);

test("a remote editor session gets external changes as steps and saves splice-preserving", async () => {
  const folder = fixtureVault({ "Note.md": "---\nk: v\n---\nAlpha.\n\n* Beta\n" });
  const vault = await openTestVault(folder);
  const handlers = serveVault(vault);
  const statuses: VaultStatus[] = [];
  const off = handlers.streams.status(null, (s) => statuses.push(s));
  expect(statuses[0]?.state).toBe("ready");
  off();

  const id = (await vault.store.listTree(vault.workspaceId))[0]!.id;
  const { session, source } = await handlers.requests.openDocument({ id });
  let doc: Node = parse(source).doc;
  const events: DocumentEvent[] = [];
  handlers.streams.document({ session }, (event) => {
    events.push(event);
    if (event.type !== "steps") return;
    const tr = new Transform(doc);
    for (const s of event.steps) tr.replace(s.from, s.to, Slice.fromJSON(schema, s.slice));
    doc = tr.doc;
  });

  writeFileSync(join(folder, "Note.md"), "---\nk: v\n---\nAlpha, changed.\n\n* Beta\n");
  await handlers.requests.rescan({ paths: ["Note.md"] });
  expect(events.map((e) => e.type)).toEqual(["steps"]);
  expect(doc.firstChild!.textContent).toBe("Alpha, changed.");

  // The editor edits the list item; only that block's bytes change.
  const item = doc.child(1);
  const pos = doc.child(0).nodeSize + 1 + 1 + 1;
  doc = new Transform(doc).insert(pos + item.textContent.length, schema.text(" and Gamma")).doc;
  await handlers.requests.updateDocument({ session, doc: doc.toJSON() });
  expect(await handlers.requests.saveDocument({ session, doc: doc.toJSON() })).toEqual({
    changed: true,
    verified: true,
  });
  expect(readFileSync(join(folder, "Note.md"), "utf8")).toBe(
    "---\nk: v\n---\nAlpha, changed.\n\n* Beta and Gamma\n",
  );
  await handlers.requests.closeDocument({ session });
  handlers.close();
});

test("orders updates and steps by sequence numbers (LYD-254)", async () => {
  const folder = fixtureVault({ "Note.md": "Alpha.\n\nBeta.\n" });
  const vault = await openTestVault(folder);
  const handlers = serveVault(vault);
  const id = (await vault.store.listTree(vault.workspaceId))[0]!.id;
  const { session, source } = await handlers.requests.openDocument({ id });
  const events: Extract<DocumentEvent, { type: "steps" }>[] = [];
  handlers.streams.document({ session }, (e) => {
    if (e.type === "steps") events.push(e);
  });
  const apply = (doc: Node, e: (typeof events)[number]) => {
    const tr = new Transform(doc);
    for (const s of e.steps) tr.replace(s.from, s.to, Slice.fromJSON(schema, s.slice));
    return tr.doc;
  };
  // The editor appends to the second paragraph.
  const edit = (doc: Node, text: string) => {
    const end = doc.child(0).nodeSize + doc.child(1).nodeSize - 1;
    return new Transform(doc).insert(end, schema.text(text)).doc;
  };

  let doc = edit(parse(source).doc, " One");
  await handlers.requests.updateDocument({ session, doc: doc.toJSON(), seq: 1, version: 0 });

  // Another program changes the first paragraph; the steps are based on update 1.
  writeFileSync(join(folder, "Note.md"), "Alpha, changed.\n\nBeta.\n");
  await handlers.requests.rescan({ paths: ["Note.md"] });
  expect(events.map((e) => [e.version, e.basedOn])).toEqual([[1, 1]]);

  // Update 2 was built before the editor applied those steps: it is dropped, and a save of it
  // writes nothing (it would revert the external change).
  const before = edit(doc, " Two");
  await handlers.requests.updateDocument({ session, doc: before.toJSON(), seq: 2, version: 0 });
  expect(
    await handlers.requests.saveDocument({ session, doc: before.toJSON(), seq: 2, version: 0 }),
  ).toEqual({ changed: false, verified: true, stale: true });
  expect(readFileSync(join(folder, "Note.md"), "utf8")).toBe("Alpha, changed.\n\nBeta.\n");

  // The editor applies the steps (they were based on update 1, its doc then) on top of its edit.
  doc = edit(apply(doc, events[0]!), " Two");
  await handlers.requests.updateDocument({ session, doc: doc.toJSON(), seq: 3, version: 1 });
  // An older update arriving late is ignored.
  await handlers.requests.updateDocument({ session, doc: before.toJSON(), seq: 2, version: 1 });
  expect(
    await handlers.requests.saveDocument({ session, doc: doc.toJSON(), seq: 4, version: 1 }),
  ).toMatchObject({ changed: true });
  expect(readFileSync(join(folder, "Note.md"), "utf8")).toBe("Alpha, changed.\n\nBeta. One Two\n");

  // The next external change is based on the latest update the server took (3, then the save's 4).
  writeFileSync(join(folder, "Note.md"), "Alpha, again.\n\nBeta. One Two\n");
  await handlers.requests.rescan({ paths: ["Note.md"] });
  expect(events.map((e) => [e.version, e.basedOn])).toEqual([
    [1, 1],
    [2, 4],
  ]);
  // Untagged updates (older clients) are taken as before.
  await handlers.requests.updateDocument({ session, doc: before.toJSON() });
  await handlers.requests.closeDocument({ session });
  handlers.close();
});
