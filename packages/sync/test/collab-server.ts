// A Hocuspocus v4 server on Bun.serve, behaving like the core's collab service where @lydie/sync
// can tell: token auth with refusal reasons, read-only levels, `lydie.access` messages, access
// revocation as a per-document close with reason "forbidden", and stored state across restarts.
import { Hocuspocus } from "@hocuspocus/server";
import * as Y from "yjs";

type Level = "none" | "view" | "comment" | "edit" | "full";

class Refused extends Error {
  constructor(readonly reason: string) {
    super("");
  }
}

type Context = { user: string; level: Level };

export type TestCollabServer = {
  url: string;
  port: number;
  hocuspocus: Hocuspocus<Context>;
  // Bytes stored per document (survives `stop`/`restart`).
  stored: Map<string, Uint8Array>;
  // Websocket connections opened so far.
  sockets: () => number;
  // Tokens refused as "unauthenticated" (stale).
  staleTokens: Set<string>;
  setAccess(user: string, documentName: string, level: Level): void;
  // Re-checks live connections like the core does (and the API's poke after a permission change).
  recheck(): void;
  text(documentName: string): Promise<string>;
  stop(): Promise<void>;
  restart(): Promise<void>;
};

// Tokens are "<user>" or "<user>#<anything>"; access is per (user, document), default "edit".
export async function startTestCollabServer(port = 0): Promise<TestCollabServer> {
  const stored = new Map<string, Uint8Array>();
  const access = new Map<string, Level>();
  const staleTokens = new Set<string>();
  let sockets = 0;
  const levelOf = (user: string, doc: string) => access.get(`${user}\0${doc}`) ?? "edit";

  const hocuspocus = new Hocuspocus<Context>({
    quiet: true,
    debounce: 10,
    maxDebounce: 50,
    async onAuthenticate({ token, documentName, connectionConfig }) {
      if (!token || staleTokens.has(token)) throw new Refused("unauthenticated");
      const user = token.split("#")[0]!;
      const level = levelOf(user, documentName);
      if (level === "none") throw new Refused("forbidden");
      connectionConfig.readOnly = level === "view" || level === "comment";
      return { user, level };
    },
    async onLoadDocument({ documentName, document }) {
      const state = stored.get(documentName);
      if (state) Y.applyUpdate(document, state);
    },
    async onStoreDocument({ documentName, document }) {
      stored.set(documentName, Y.encodeStateAsUpdate(document));
    },
  });

  type SocketData = {
    request: Request;
    connection?: ReturnType<typeof hocuspocus.handleConnection>;
  };
  let server: ReturnType<typeof Bun.serve<SocketData>> | null = null;
  const listen = (at: number) =>
    Bun.serve<SocketData>({
      port: at,
      fetch(request, bunServer) {
        if (bunServer.upgrade(request, { data: { request } })) return undefined;
        return new Response("ok");
      },
      websocket: {
        open(ws) {
          sockets++;
          ws.data.connection = hocuspocus.handleConnection(ws as never, ws.data.request);
        },
        message(ws, message) {
          if (typeof message === "string") return;
          ws.data.connection?.handleMessage(new Uint8Array(message));
        },
        close(ws, code, reason) {
          ws.data.connection?.handleClose({ code, reason });
        },
      },
    });
  server = listen(port);
  const boundPort = server.port!;

  const result: TestCollabServer = {
    url: `ws://127.0.0.1:${boundPort}`,
    port: boundPort,
    hocuspocus,
    stored,
    sockets: () => sockets,
    staleTokens,
    setAccess(user, documentName, level) {
      access.set(`${user}\0${documentName}`, level);
    },
    recheck() {
      for (const [documentName, document] of hocuspocus.documents) {
        for (const connection of document.getConnections()) {
          const context = connection.context;
          const level = levelOf(context.user, documentName);
          if (level === "none") {
            connection.sendStateless(
              JSON.stringify({ type: "lydie.access", level: "none", readOnly: true }),
            );
            connection.close({ code: 4403, reason: "forbidden" });
            continue;
          }
          const readOnly = level === "view" || level === "comment";
          if (level !== context.level || readOnly !== connection.readOnly) {
            context.level = level;
            connection.readOnly = readOnly;
            connection.sendStateless(JSON.stringify({ type: "lydie.access", level, readOnly }));
          }
        }
      }
    },
    async text(documentName) {
      const live = hocuspocus.documents.get(documentName);
      if (live) return live.getText("body").toJSON();
      const doc = new Y.Doc();
      const state = stored.get(documentName);
      if (state) Y.applyUpdate(doc, state);
      return doc.getText("body").toJSON();
    },
    async stop() {
      for (const document of hocuspocus.documents.values()) {
        stored.set(document.name, Y.encodeStateAsUpdate(document));
      }
      await server?.stop(true);
      server = null;
      for (const document of [...hocuspocus.documents.values()]) {
        await hocuspocus.unloadDocument(document);
      }
    },
    async restart() {
      server = listen(boundPort);
    },
  };
  return result;
}
