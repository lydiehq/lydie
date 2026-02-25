import { serve } from "@hono/node-server";
import * as Sentry from "@sentry/node";

import { app, injectWebSocket } from "./api";
import { env } from "./env";

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.APP_STAGE,
  });
}

const port = 3001;

const server = serve({
  fetch: app.fetch,
  port,
});

injectWebSocket(server);
