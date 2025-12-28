import { app } from "./api";
import type { Serve } from "bun";
import { createYjsServer } from "./yjs-server";

// Start Yjs WebSocket server on port 1234
createYjsServer(1234);

export default {
  port: 3001,
  fetch: app.fetch,
  idleTimeout: 60,
} satisfies Serve.Options<undefined>;
