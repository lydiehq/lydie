import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { hocuspocus } from "../hocuspocus-server";
import { InternalApi } from "./internal";
import { PublicApi } from "./public";
import { V1Api } from "./v1";

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
  .route("/v1/:idOrSlug", V1Api)
  .route("/public", PublicApi);

export const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({
  app,
});

app.get(
  "/yjs",
  upgradeWebSocket((c) => {
    return {
      onOpen(_evt, ws) {
        if (!ws.raw) {
          throw new Error("WebSocket not available");
        }
        hocuspocus.handleConnection(ws.raw, c.req.raw as any);
      },
    };
  }),
);

export type AppType = typeof app;
