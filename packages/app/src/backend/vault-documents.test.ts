// The client half of file-session ordering (LYD-269): updates and saves carry `seq` and the last
// applied steps `version`; a stale save is reported so the editor applies the steps and saves again.
import { describe, expect, test } from "bun:test";

import { createLocalServiceChannel } from "@lydie/platform";
import type { ServiceDefinition } from "@lydie/platform";
import type { DocumentSessionEvent } from "@lydie/plugin-api";

import { createVaultDocuments } from "./vault-documents.ts";

type Sent = { op: string; seq?: number; version?: number };

function fakeVault() {
  const sent: Sent[] = [];
  let emit: ((event: DocumentSessionEvent) => void) | null = null;
  let staleOnce = false;
  const channel = createLocalServiceChannel();
  const vault = { name: "lydie-vault" } as ServiceDefinition<never>;
  channel.register(vault, {
    requests: {
      openDocument: () => ({ session: "s1", source: "Hello\n" }),
      updateDocument: ({ seq, version }: { seq?: number; version?: number }) => {
        sent.push({
          op: "update",
          ...(seq !== undefined ? { seq } : {}),
          ...(version !== undefined ? { version } : {}),
        });
        return null;
      },
      saveDocument: ({ seq, version }: { seq?: number; version?: number }) => {
        sent.push({
          op: "save",
          ...(seq !== undefined ? { seq } : {}),
          ...(version !== undefined ? { version } : {}),
        });
        if (staleOnce) {
          staleOnce = false;
          return { changed: false, verified: true, stale: true };
        }
        return { changed: true, verified: true };
      },
      closeDocument: () => null,
      conflicts: () => [],
      resolveConflict: () => null,
    },
    streams: {
      document: (_params: unknown, send: (event: DocumentSessionEvent) => void) => {
        emit = send;
        return () => {
          emit = null;
        };
      },
    },
  } as never);
  return {
    channel,
    sent,
    emit: (event: DocumentSessionEvent) => emit?.(event),
    staleNextSave: () => (staleOnce = true),
  };
}

const tick = () => new Promise((r) => setTimeout(r, 10));

describe("vault document sessions", () => {
  test("updates and saves carry seq and the last applied version", async () => {
    const vault = fakeVault();
    const session = await createVaultDocuments(vault.channel).open(
      "01928000-0000-0000-0000-000000000000",
    );
    const seen: DocumentSessionEvent[] = [];
    const off = session.subscribe((e) => seen.push(e));
    await tick();
    expect(session.update({ type: "doc" })).toBe(1);
    expect(session.update({ type: "doc" })).toBe(2);
    vault.emit({ type: "steps", steps: [], source: "Hi\n", version: 1, basedOn: 2 });
    await tick();
    expect(seen.map((e) => e.type === "steps" && [e.version, e.basedOn])).toEqual([[1, 2]]);
    expect(session.update({ type: "doc" })).toBe(3);
    const saved = await session.save({ type: "doc" });
    expect(saved).toEqual({ changed: true, seq: 4 });
    await tick();
    expect(vault.sent).toEqual([
      { op: "update", seq: 1 },
      { op: "update", seq: 2 },
      { op: "update", seq: 3, version: 1 },
      { op: "save", seq: 4, version: 1 },
    ]);
    off();
    session.close();
  });

  test("a stale save is reported", async () => {
    const vault = fakeVault();
    const session = await createVaultDocuments(vault.channel).open(
      "01928000-0000-0000-0000-000000000000",
    );
    vault.staleNextSave();
    expect(await session.save({ type: "doc" })).toEqual({ changed: false, stale: true, seq: 1 });
    expect(await session.save({ type: "doc" })).toEqual({ changed: true, seq: 2 });
    session.close();
  });
});
