// `Backend.documents` over the file bridge's vault service ("lydie-vault", served by the Electron
// main process for a window with a folder). The contract is restated structurally here: this
// package may not import @lydie/bridge-fs, which owns it.
import { serviceClient } from "@lydie/platform";
import type { ServiceChannel, ServiceDefinition } from "@lydie/platform";
import type { BackendDocuments, DocumentSessionEvent, FileConflictInfo } from "@lydie/plugin-api";

type WireConflict = FileConflictInfo & { conflicts?: unknown };

type VaultDocumentsContract = {
  requests: {
    openDocument: { input: { id: string }; output: { session: string; source: string } };
    // `seq` increases with every update; `version` is the last steps event applied to `doc`
    // (LYD-254/269): main drops updates that lack steps it already sent.
    updateDocument: {
      input: { session: string; doc: unknown; seq?: number; version?: number };
      output: null;
    };
    saveDocument: {
      input: { session: string; doc: unknown; seq?: number; version?: number };
      output: { changed: boolean; verified: boolean; stale?: boolean };
    };
    closeDocument: { input: { session: string }; output: null };
    conflicts: {
      input: null;
      output: { id: string; kind: string; details: unknown; detectedAt: string }[];
    };
    resolveConflict: { input: { id: string }; output: null };
  };
  streams: {
    document: { params: { session: string }; event: DocumentSessionEvent };
  };
};

const vault: ServiceDefinition<VaultDocumentsContract> = { name: "lydie-vault" };

function toConflict(c: WireConflict): FileConflictInfo {
  return {
    id: c.id,
    path: c.path,
    conflictPath: c.conflictPath,
    conflictId: c.conflictId,
    at: c.at,
  };
}

export function createVaultDocuments(channel: ServiceChannel): BackendDocuments {
  const client = serviceClient(channel, vault);
  return {
    async open(id) {
      const { session, source } = await client.request("openDocument", { id });
      let closed = false;
      let seq = 0;
      // The last steps event the editor applied (listeners run synchronously on delivery).
      let version: number | undefined;
      const tags = () => ({ seq: ++seq, ...(version !== undefined ? { version } : {}) });
      return {
        source,
        update(doc) {
          const tagged = tags();
          if (!closed)
            void client.request("updateDocument", { session, doc, ...tagged }).catch(() => {});
          return tagged.seq;
        },
        async save(doc) {
          const tagged = tags();
          const result = await client.request("saveDocument", { session, doc, ...tagged });
          return {
            changed: result.changed,
            seq: tagged.seq,
            ...(result.stale ? { stale: true } : {}),
          };
        },
        subscribe(listener) {
          return client.subscribe("document", { session }, (event) => {
            if (event.type === "conflict") {
              listener({ type: "conflict", conflict: toConflict(event.conflict as WireConflict) });
              return;
            }
            listener(event);
            if (event.type === "steps" && event.version !== undefined) version = event.version;
          });
        },
        close() {
          if (closed) return;
          closed = true;
          void client.request("closeDocument", { session }).catch(() => {});
        },
      };
    },
    async conflicts() {
      const rows = await client.request("conflicts", null);
      return rows
        .filter((r) => r.kind === "file")
        .map((r) => toConflict(r.details as WireConflict));
    },
    async resolveConflict(id) {
      await client.request("resolveConflict", { id });
    },
  };
}
