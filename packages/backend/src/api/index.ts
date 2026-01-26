import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { hocuspocus } from "../hocuspocus-server";
import { ExternalApi } from "./external";
import { InternalApi } from "./internal";
import { PublicApi } from "./public";

export const app = new Hono()
  .use(
    cors({
      origin: [
        "https://app.lydie.co",
        "https://lydie.co",
        "http://localhost:3000",
        "http://localhost:4321",
      ],
      credentials: true,
    }),
  )
  .use(logger())
  .get("/", async (c) => {
    return c.text("ok");
  })
  .route("/internal", InternalApi)
  .route("/v1/:idOrSlug", ExternalApi)
  .route("/public", PublicApi);

export const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({
  app,
});

// Support both legacy per-document URLs and new multiplexed endpoint
app.get(
  "/yjs/:documentId",
  upgradeWebSocket((c) => {
    const documentId = c.req.param("documentId");

    return {
      onOpen(_evt, ws) {
        if (!ws.raw) {
          throw new Error("WebSocket not available");
        }
        hocuspocus.handleConnection(ws.raw, c.req.raw as any, documentId);
      },
    };
  }),
);

// Multiplexing endpoint - single connection for all documents
app.get(
  "/yjs",
  upgradeWebSocket((c) => {
    return {
      onOpen(_evt, ws) {
        if (!ws.raw) {
          throw new Error("WebSocket not available");
        }
        // Don't pass documentId - let Hocuspocus extract it from the protocol
        hocuspocus.handleConnection(ws.raw, c.req.raw as any);
      },
    };
  }),
);

export type AppType = typeof app;
