import { logger } from "hono/logger";
import { ExternalApi } from "./external";
import { InternalApi } from "./internal";
import { Hono } from "hono";
import { cors } from "hono/cors";

export const app = new Hono()
  .use(
    cors({
      origin: [
        "https://cloud.lydie.co",
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
  .route("/v1/:organizationId", ExternalApi);

export type AppType = typeof app;
