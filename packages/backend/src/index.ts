import * as Sentry from "@sentry/node";

import { app, websocket } from "./api";
import { env } from "./env";

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.APP_STAGE,
  });
}

const port = 3001;

Bun.serve({
  fetch: app.fetch,
  websocket,
  port,
});
