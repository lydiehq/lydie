import { serve } from "@hono/node-server";

import { app, injectWebSocket } from "./api";

const port = 3001;

const server = serve({
  fetch: app.fetch,
  port,
});

injectWebSocket(server);
