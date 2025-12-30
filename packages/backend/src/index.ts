import { app, injectWebSocket } from "./api";
import { serve } from "@hono/node-server";
import { hocuspocus } from "./hocuspocus-server";

const port = 3001;

// Start server
const server = serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`Started development server: http://localhost:${info.port}`);
    hocuspocus.hooks("onListen", {
      instance: hocuspocus,
      configuration: hocuspocus.configuration,
      port: info.port,
    });
  }
);

// Setup WebSocket support (Node.js specific)
injectWebSocket(server);
