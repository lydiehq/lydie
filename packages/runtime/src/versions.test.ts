import { describe, expect, it } from "bun:test";

import type { Actor } from "@lydie/contract";

import { createMemoryPorts } from "./memory/index.ts";
import { createRuntime } from "./runtime.ts";
import { createMemoryVersionStore, createSnapshotVersions, pruneVersions } from "./versions.ts";
import type { VersionRecord } from "./versions.ts";

const WS = "01973200-0000-0000-0000-000000000000";
const user: Actor = { type: "user", id: "u1" };
const agent: Actor = { type: "agent", app: "claude", id: "a1", onBehalfOf: "u1" };

function setup(step = 1000) {
  const ports = createMemoryPorts();
  let tick = Date.parse("2026-11-12T10:00:00.000Z");
  const runtime = createRuntime({
    ...ports,
    actor: user,
    clock: { now: () => new Date((tick += step)) },
  });
  return { ports, runtime, ops: runtime.ops, wait: (ms: number) => (tick += ms) };
}

describe("version history operations", () => {
  it("keeps one version per round of edits by one author", async () => {
    const { ops } = setup();
    const doc = await ops.doc.create({ workspaceId: WS, title: "A", markdown: "one" });
    await ops.doc.updateBody({ id: doc.id, markdown: "two" });
    await ops.doc.updateBody({ id: doc.id, markdown: "three" });
    const { versions } = await ops.doc.listVersions({ id: doc.id });
    expect(versions.map((v) => [v.kind, v.authors])).toEqual([["auto", ["u1"]]]);
    const got = await ops.doc.getVersion({ id: doc.id, versionId: versions[0]!.id });
    expect(got.markdown).toBe("three");
    expect(got.version.sizeBytes).toBe(5);
  });

  it("starts a new version when the author changes or the window has passed", async () => {
    const { ops, runtime, wait } = setup();
    const doc = await ops.doc.create({ workspaceId: WS, title: "A", markdown: "mine" });
    await runtime.as(agent).doc.updateBody({ id: doc.id, markdown: "the agent's" });
    wait(11 * 60_000);
    await runtime.as(agent).doc.updateBody({ id: doc.id, markdown: "the agent's, later" });
    const { versions } = await ops.doc.listVersions({ id: doc.id });
    expect(versions.map((v) => v.authors[0])).toEqual([
      "agent:claude:a1:u1",
      "agent:claude:a1:u1",
      "u1",
    ]);
    // What I wrote is still there, exactly as the agent found it.
    const mine = await ops.doc.getVersion({ id: doc.id, versionId: versions[2]!.id });
    expect(mine.markdown).toBe("mine");
  });

  it("restores a version, keeps the body it replaced, and undoes as one step", async () => {
    const { ops, runtime, ports } = setup();
    const doc = await ops.doc.create({ workspaceId: WS, title: "A", markdown: "first [[B]]" });
    await runtime.as(agent).doc.updateBody({ id: doc.id, markdown: "second" });
    const before = await ops.doc.listVersions({ id: doc.id });
    const first = before.versions.at(-1)!;

    const restored = await ops.doc.restoreVersion({ id: doc.id, versionId: first.id });
    expect(restored.previousVersionId).toBe(before.versions[0]!.id);
    expect(ports.state.bodies.get(doc.id)?.markdown).toBe("first [[B]]");
    expect((await ops.doc.outgoingLinks({ id: doc.id })).links).toHaveLength(1);

    const after = await ops.doc.listVersions({ id: doc.id });
    expect(after.versions[0]).toMatchObject({ kind: "restore", restoredFrom: first.id });

    expect(await runtime.history.undo()).toBe(true);
    expect(ports.state.bodies.get(doc.id)?.markdown).toBe("second");

    // Restoring what is already the body changes nothing.
    const same = await ops.doc.restoreVersion({ id: doc.id, versionId: before.versions[0]!.id });
    expect(same).toMatchObject({ previousVersionId: null });
  });

  it("answers not_found for a version of another document", async () => {
    const { ops } = setup();
    const a = await ops.doc.create({ workspaceId: WS, title: "A", markdown: "a" });
    const b = await ops.doc.create({ workspaceId: WS, title: "B", markdown: "b" });
    const { versions } = await ops.doc.listVersions({ id: a.id });
    await expect(
      ops.doc.getVersion({ id: b.id, versionId: versions[0]!.id }),
    ).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("says so when the backend keeps no versions", async () => {
    const { versions: _none, ...ports } = createMemoryPorts();
    const runtime = createRuntime({ ...ports, actor: user });
    const doc = await runtime.ops.doc.create({ workspaceId: WS, title: "A", markdown: "a" });
    await expect(runtime.ops.doc.listVersions({ id: doc.id })).rejects.toMatchObject({
      code: "internal",
    });
  });
});

describe("snapshot versions", () => {
  const at = (minutes: number) => new Date(Date.UTC(2026, 10, 12, 10, minutes)).toISOString();
  const change = (before: string | null, after: string, minutes: number, actor = "u1") => ({
    documentId: "d",
    workspaceId: WS,
    before,
    after,
    actor,
    at: at(minutes),
  });

  it("keeps a body that changed without a record before writing over it", async () => {
    const versions = createSnapshotVersions(createMemoryVersionStore());
    // The first edit of a note that was already there.
    await versions.record(change("written elsewhere", "edited here", 0));
    // Changed while the app was closed, then edited again.
    await versions.record(change("changed while closed", "edited again", 30));
    const list = await versions.list("d", 50);
    expect(list.map((v) => v.kind)).toEqual(["auto", "before_write", "auto", "before_write"]);
    expect((await versions.get("d", list[1]!.id))?.markdown).toBe("changed while closed");
    expect((await versions.get("d", list[3]!.id))?.markdown).toBe("written elsewhere");
  });

  it("checkpoint reuses the newest version when it already holds the body", async () => {
    const versions = createSnapshotVersions(createMemoryVersionStore());
    await versions.record(change(null, "a", 0));
    const [head] = await versions.list("d", 1);
    expect(await versions.checkpoint("d", "a", at(1))).toBe(head!.id);
    const other = await versions.checkpoint("d", "b", at(2));
    expect(other).not.toBe(head!.id);
    expect((await versions.list("d", 50)).map((v) => v.kind)).toEqual(["before_write", "auto"]);
  });

  it("serialises changes that arrive together", async () => {
    const versions = createSnapshotVersions(createMemoryVersionStore(), { windowMs: 0 });
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => versions.record(change(`${i}`, `${i + 1}`, i))),
    );
    const list = await versions.list("d", 50);
    expect(list).toHaveLength(21);
    expect((await versions.get("d", list[0]!.id))?.markdown).toBe("20");
  });

  it("prunes to the newest few plus one a day", () => {
    const record = (i: number, createdAt: string): VersionRecord => ({
      id: `v${i}`,
      documentId: "d",
      kind: "auto",
      authors: ["u1"],
      restoredFrom: null,
      sizeBytes: 1,
      createdAt,
      startedAt: createdAt,
      contentKey: `${i}`,
    });
    const records = [
      record(0, "2026-09-01T10:00:00.000Z"), // older than 30 days: gone
      record(1, "2026-11-01T08:00:00.000Z"), // not the newest of its day: gone
      record(2, "2026-11-01T09:00:00.000Z"),
      record(3, "2026-11-10T09:00:00.000Z"),
      record(4, "2026-11-12T09:00:00.000Z"),
      record(5, "2026-11-12T09:30:00.000Z"),
    ];
    const kept = pruneVersions(records, Date.parse("2026-11-12T10:00:00.000Z"), 2, 30);
    expect(kept.map((r) => r.id)).toEqual(["v2", "v3", "v4", "v5"]);
  });
});
