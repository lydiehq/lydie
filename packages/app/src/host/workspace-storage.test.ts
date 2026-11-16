import { describe, expect, test } from "bun:test";

import type { HandoffApi, HandoffOutcome, HostServices } from "@lydie/plugin-api";

import { createMemoryStorage } from "./stores.ts";
import { carryOnHandoff, carryWorkspaceStorage } from "./workspace-storage.ts";

const FROM = "01JLOCAL000000000000000000";
const TO = "01JHOSTED00000000000000000";
const GS_FROM = "01JGSFROM00000000000000000";
const GS_TO = "01JGSTO0000000000000000000";

function seeded() {
  const storage = createMemoryStorage();
  storage.set(`plugin:document-tree:favorites:${FROM}`, ["a", GS_FROM]);
  storage.set(`plugin:home:recent:${FROM}`, [
    { id: GS_FROM, at: 2 },
    { id: "a", at: 1 },
  ]);
  storage.set(`plugin:team:spaces.collapsed:${FROM}`, ["child"]);
  storage.set(`plugin:document-tree:team.spaces.expanded:${FROM}:private`, ["a"]);
  storage.set(`plugin:shared:last:${FROM}`, "a");
  // Another workspace's, a setting for every workspace, and the host's own keys stay as they are.
  storage.set(`plugin:document-tree:favorites:01JOTHER000000000000000000`, ["z"]);
  storage.set("plugin:settings:editor.fontSize", 16);
  storage.set(`window-of:${FROM}`, "host's own");
  return storage;
}

describe("per-workspace device settings follow a hand-off", () => {
  test("are copied to the new workspace id, with renamed document ids", () => {
    const storage = seeded();
    carryWorkspaceStorage(storage, FROM, TO, { [GS_FROM]: GS_TO });
    expect(storage.get(`plugin:document-tree:favorites:${TO}`)).toEqual(["a", GS_TO]);
    expect(storage.get(`plugin:home:recent:${TO}`)).toEqual([
      { id: GS_TO, at: 2 },
      { id: "a", at: 1 },
    ]);
    expect(storage.get(`plugin:team:spaces.collapsed:${TO}`)).toEqual(["child"]);
    expect(storage.get(`plugin:document-tree:team.spaces.expanded:${TO}:private`)).toEqual(["a"]);
    expect(storage.get(`plugin:shared:last:${TO}`)).toBe("a");
    // The local workspace keeps its own.
    expect(storage.get(`plugin:document-tree:favorites:${FROM}`)).toEqual(["a", GS_FROM]);
    expect(storage.keys!().filter((k) => k.includes(TO))).toHaveLength(5);
  });

  test("keep what the target workspace already has on this device", () => {
    const storage = seeded();
    storage.set(`plugin:document-tree:favorites:${TO}`, ["mine"]);
    carryWorkspaceStorage(storage, FROM, TO, {});
    expect(storage.get(`plugin:document-tree:favorites:${TO}`)).toEqual(["mine"]);
    expect(storage.get(`plugin:team:spaces.collapsed:${TO}`)).toEqual(["child"]);
  });

  test("are copied once the account's hand-off succeeds", async () => {
    const storage = seeded();
    let outcome: HandoffOutcome = {
      ok: false,
      applied: 0,
      duplicates: 0,
      rejected: [],
      bodies: { pushed: 0, skipped: 0, failed: [] },
      attachments: { uploaded: 0, missing: [], failed: ["x"] },
      renamed: { [GS_FROM]: GS_TO },
    };
    const handoff: HandoffApi = {
      plan: async (target) => ({ summary: {} as never, target }),
      run: async () => outcome,
    };
    const services = carryOnHandoff(
      { account: { handoff } as HostServices["account"] },
      storage,
      FROM,
    );
    const api = services!.account!.handoff!;
    const plan = await api.plan({ workspaceId: TO, workspaceName: "Hosted" });

    // A failed run copies nothing yet; running it again until it succeeds does.
    expect(await api.run(plan)).toBe(outcome);
    expect(storage.get(`plugin:document-tree:favorites:${TO}`)).toBeNull();
    outcome = { ...outcome, ok: true, attachments: { uploaded: 0, missing: [], failed: [] } };
    await api.run(plan);
    expect(storage.get(`plugin:document-tree:favorites:${TO}`)).toEqual(["a", GS_TO]);
  });
});
