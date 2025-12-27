import { app } from "./api";
import type { Serve } from "bun";

export default {
  port: 3001,
  fetch: app.fetch,
  idleTimeout: 60,
} satisfies Serve.Options<undefined>;
