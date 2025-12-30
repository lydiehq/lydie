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
    console.log(`[WebSocket] Upgrade request for document: ${documentId}`);

    // Get the Web API Request
    const webRequest = c.req.raw;

    // Convert Web API Request headers to Node.js IncomingMessage format
    // Hocuspocus expects a Node.js IncomingMessage with headers
    const headers: Record<string, string | string[] | undefined> = {};
    webRequest.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // Also get all headers as a flat object for cookie access
    const headerEntries: string[] = [];
    webRequest.headers.forEach((value, key) => {
      headerEntries.push(`${key}: ${value}`);
    });

    console.log(`[WebSocket] Request headers:`, Object.keys(headers));
    console.log(`[WebSocket] Cookie header:`, headers.cookie);

    // Create a mock IncomingMessage-like object
    // We need to pass this to Hocuspocus so it can access headers for authentication
    const mockRequest = {
      url: `/yjs/${documentId}`,
      method: webRequest.method,
      headers: headers,
      // Add rawHeaders for compatibility
      rawHeaders: headerEntries,
    } as any as IncomingMessage;

    return {
      onOpen(_evt, ws) {
        console.log(
          `[WebSocket] Connection opened for document: ${documentId}`
        );
        console.log(`[WebSocket] Calling handleConnection...`);

        try {
          // Pass documentName explicitly as the third parameter
          // Pass the mock request with headers so Hocuspocus can authenticate
          hocuspocus.handleConnection(ws.raw, mockRequest, documentId);
          console.log(`[WebSocket] handleConnection called successfully`);
        } catch (error) {
          console.error(`[WebSocket] Error calling handleConnection:`, error);
        }
      },
    };
  })
);

export type AppType = typeof app;
