import { logger } from "hono/logger";
import { ExternalApi } from "./external";
import { InternalApi } from "./internal";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { hocuspocus } from "../hocuspocus-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { IncomingMessage } from "http";

export const app = new Hono()
  .use(
    cors({
      origin: [
        "https://app.lydie.co",
        "https://lydie.co",
        "http://localhost:3000",
      ],
      credentials: true,
    })
  )
  .use(logger())
  .get("/", async (c) => {
    return c.text("ok");
  })
  .route("/internal", InternalApi)
  .route("/v1/:idOrSlug", ExternalApi);

// Export the WebSocket setup function
export const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({
  app,
});

// Mount Hocuspocus WebSocket endpoint
app.get(
  "/yjs/:documentId",
  upgradeWebSocket((c) => {
    const documentId = c.req.param("documentId");

    // Get the Web API Request
    const webRequest = c.req.raw;

    // Convert Web API Request headers to Node.js IncomingMessage format
    // Hocuspocus expects a Node.js IncomingMessage with headers
    const headers: Record<string, string | string[] | undefined> = {};
    webRequest.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    const headerEntries: string[] = [];
    webRequest.headers.forEach((value, key) => {
      headerEntries.push(`${key}: ${value}`);
    });
    const mockRequest = {
      url: `/yjs/${documentId}`,
      method: webRequest.method,
      headers: headers,
      rawHeaders: headerEntries,
    } as any as IncomingMessage;

    return {
      onOpen(_evt, ws) {
        if (!ws.raw) {
          throw new Error("WebSocket not available");
        }
        hocuspocus.handleConnection(ws.raw, mockRequest, documentId);
      },
    };
  })
);

export type AppType = typeof app;
