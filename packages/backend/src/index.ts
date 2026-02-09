import { serve } from "@hono/node-server";
import * as Sentry from "@sentry/node";

import { app, injectWebSocket } from "./api";

if (Resource.SentryDsn.value) {
  Sentry.init({
    dsn: Resource.SentryDsn.value,
    environment: Resource.App.stage,
  });
}

const port = 3001;

const server = serve({
  fetch: app.fetch,
  port,
});

injectWebSocket(server);
