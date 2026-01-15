import { app, injectWebSocket } from "./api";
import { serve } from "@hono/node-server";
import { hocuspocus } from "./hocuspocus-server";

const port = 3001;

const server = serve({
  fetch: app.fetch,
  port,
});

injectWebSocket(server);
