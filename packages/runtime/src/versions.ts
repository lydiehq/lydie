import type { DocumentVersion } from "@lydie/contract";

import type { BodyChange, Ids, Versions } from "./ports.ts";
import { bodyVersion } from "./text.ts";
import { uuid } from "./uuid.ts";

// Snapshot version history: the `Versions` provider for backends with no history of their own.
// The policy lives here; where snapshots are kept is a `VersionStore` (memory for tests, files
// beside a folder's database in @lydie/bridge-fs).
//
// A version is the body at the end of a round of edits by one author. While the same author keeps
// editing within `windowMs` of the round's start, the newest version follows the body instead of
// a new one being added, so the newest version is always the current body and the one before it
// is where the round started. A body that changed without a record (the first edit here, a change
// made while the app was closed) is kept first as `before_write`.

// What a store keeps per version, besides its text.
export type VersionRecord = DocumentVersion & {
  // When its round of edits began (`createdAt` is when it last changed).
  startedAt: string;
  // `bodyVersion` of its text.
  contentKey: string;
};

export type VersionStore = {
  // A document's versions, oldest first.
  list(documentId: string): Promise<VersionRecord[]>;
  read(documentId: string, versionId: string): Promise<string | null>;
  // Replaces a document's versions with `records`. `contents` holds the text of new and changed
  // ones by id; text of versions no longer listed is deleted.
  save(
    documentId: string,
    records: readonly VersionRecord[],
    contents: Readonly<Record<string, string>>,
  ): Promise<void>;
};

export type SnapshotOptions = {
  // How long one author's edits stay one version. Default 10 minutes.
  windowMs?: number;
  // Kept per document: the newest `keep`, plus the newest of each day for `days` days (the
  // hosted core's rule). Defaults 50 and 30.
  keep?: number;
  days?: number;
  ids?: Ids;
};

const encoder = new TextEncoder();

function toVersion({ startedAt: _s, contentKey: _c, ...version }: VersionRecord): DocumentVersion {
  return version;
}

export function pruneVersions(
  records: readonly VersionRecord[],
  now: number,
  keep: number,
  days: number,
): VersionRecord[] {
  const cutoff = now - days * 86_400_000;
  const daysSeen = new Set<string>();
  const kept: VersionRecord[] = [];
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i]!;
    const day = record.createdAt.slice(0, 10);
    const newestOfDay = !daysSeen.has(day);
    daysSeen.add(day);
    const recent = records.length - i <= keep;
    if (recent || (newestOfDay && Date.parse(record.createdAt) > cutoff)) kept.push(record);
  }
  return kept.reverse();
}

export function createSnapshotVersions(
  store: VersionStore,
  options: SnapshotOptions = {},
): Required<Versions> {
  const windowMs = options.windowMs ?? 600_000;
  const keep = options.keep ?? 50;
  const days = options.days ?? 30;
  const ids = options.ids ?? { uuid };

  // One change at a time per document: each reads the list the previous one wrote.
  const queues = new Map<string, Promise<unknown>>();
  function serial<T>(documentId: string, fn: () => Promise<T>): Promise<T> {
    const run = (queues.get(documentId) ?? Promise.resolve()).then(fn, fn);
    const tail = run.catch(() => {});
    queues.set(documentId, tail);
    void tail.then(() => {
      if (queues.get(documentId) === tail) queues.delete(documentId);
    });
    return run;
  }

  function make(
    documentId: string,
    kind: DocumentVersion["kind"],
    authors: string[],
    markdown: string,
    at: string,
    restoredFrom: string | null = null,
  ): VersionRecord {
    return {
      id: ids.uuid(),
      documentId,
      kind,
      authors,
      restoredFrom,
      sizeBytes: encoder.encode(markdown).length,
      createdAt: at,
      startedAt: at,
      contentKey: bodyVersion(markdown),
    };
  }

  async function record(change: BodyChange): Promise<void> {
    await serial(change.documentId, async () => {
      const records = await store.list(change.documentId);
      const contents: Record<string, string> = {};
      const add = (version: VersionRecord, markdown: string) => {
        records.push(version);
        contents[version.id] = markdown;
      };
      const { documentId, before, after, actor, at } = change;
      if (before !== null && before !== "" && records.at(-1)?.contentKey !== bodyVersion(before)) {
        add(make(documentId, "before_write", [], before, at), before);
      }
      const head = records.at(-1);
      const key = bodyVersion(after);
      if (change.restoredFrom) {
        add(make(documentId, "restore", [actor], after, at, change.restoredFrom), after);
      } else if (
        head?.kind === "auto" &&
        head.authors.length === 1 &&
        head.authors[0] === actor &&
        Date.parse(at) - Date.parse(head.startedAt) < windowMs
      ) {
        records[records.length - 1] = {
          ...head,
          createdAt: at,
          sizeBytes: encoder.encode(after).length,
          contentKey: key,
        };
        contents[head.id] = after;
      } else if (head?.contentKey !== key) {
        add(make(documentId, "auto", [actor], after, at), after);
      }
      await store.save(documentId, pruneVersions(records, Date.parse(at), keep, days), contents);
    });
  }

  return {
    async list(documentId, limit) {
      const records = await serial(documentId, () => store.list(documentId));
      return records.reverse().slice(0, limit).map(toVersion);
    },

    async get(documentId, versionId) {
      return serial(documentId, async () => {
        const found = (await store.list(documentId)).find((r) => r.id === versionId);
        if (!found) return null;
        const markdown = await store.read(documentId, versionId);
        return markdown === null ? null : { version: toVersion(found), markdown };
      });
    },

    record,

    checkpoint(documentId, markdown, at) {
      return serial(documentId, async () => {
        const records = await store.list(documentId);
        const head = records.at(-1);
        if (head?.contentKey === bodyVersion(markdown)) return head.id;
        const version = make(documentId, "before_write", [], markdown, at);
        records.push(version);
        await store.save(documentId, pruneVersions(records, Date.parse(at), keep, days), {
          [version.id]: markdown,
        });
        return version.id;
      });
    },
  };
}

// A store in memory: tests, and backends that only need history for as long as they run.
export function createMemoryVersionStore(): VersionStore {
  const records = new Map<string, VersionRecord[]>();
  const texts = new Map<string, string>();
  return {
    async list(documentId) {
      return [...(records.get(documentId) ?? [])];
    },
    async read(documentId, versionId) {
      return texts.get(`${documentId}/${versionId}`) ?? null;
    },
    async save(documentId, next, contents) {
      const kept = new Set(next.map((r) => r.id));
      for (const old of records.get(documentId) ?? []) {
        if (!kept.has(old.id)) texts.delete(`${documentId}/${old.id}`);
      }
      for (const [id, text] of Object.entries(contents)) {
        if (kept.has(id)) texts.set(`${documentId}/${id}`, text);
      }
      records.set(documentId, [...next]);
    },
  };
}
