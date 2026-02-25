import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { hocuspocus } from "../hocuspocus-server";
import { ExternalApi } from "./external";
import { InternalApi } from "./internal";
import { PublicApi } from "./public";

const allowedOrigins = [
  "https://app.lydie.co",
  "https://lydie.co",
  "http://localhost:3000",
  "http://localhost:4321",
];

// Allow additional origins from environment variable (for Docker/testing)
if (process.env.CORS_ALLOWED_ORIGINS) {
  const additionalOrigins = process.env.CORS_ALLOWED_ORIGINS.split(",").map(o => o.trim());
  allowedOrigins.push(...additionalOrigins);
  console.log("[CORS] Additional origins allowed:", additionalOrigins);
}

console.log("[CORS] Allowed origins:", allowedOrigins);

export const app = new Hono()
  .use(
    cors({
      origin: (origin) => {
        console.log("[CORS] Checking origin:", origin);
        // Match origins with or without port 80
        const isAllowed = !origin || allowedOrigins.some(allowed => {
          if (allowed === origin) return true;
          // Match http://web:80 with http://web (browser strips :80)
          if (allowed.replace(":80", "") === origin) return true;
          return false;
        });
        
        if (isAllowed) {
          console.log("[CORS] Origin allowed:", origin);
          return origin;
        }
        console.log("[CORS] Origin NOT allowed:", origin);
        return null;
      },
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
