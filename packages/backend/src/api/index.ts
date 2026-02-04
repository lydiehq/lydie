import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { hocuspocus } from "../hocuspocus-server";
import { ExternalApi } from "./external";
import { InternalApi } from "./internal";
import { PostHogProxy } from "./posthog-proxy";
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
  .route("/public", PublicApi)
  .route("/ingest", PostHogProxy);

export const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({
  app,
});

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

export type AppType = typeof app;
