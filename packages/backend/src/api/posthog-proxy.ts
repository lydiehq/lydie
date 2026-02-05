import { Hono } from "hono";
import { proxy } from "hono/proxy";

const POSTHOG_API_URL = "https://us.i.posthog.com";
const POSTHOG_ASSETS_URL = "https://us-assets.i.posthog.com";

export const PostHogProxy = new Hono()
  .all("/static/*", async (c) => {
    const path = c.req.path.replace(/^\/ingest/, "");
    const targetUrl = `${POSTHOG_ASSETS_URL}${path}`;
    return proxy(targetUrl, c.req);
  })
  .all("/*", async (c) => {
    const path = c.req.path.replace(/^\/ingest/, "");
    const targetUrl = `${POSTHOG_API_URL}${path}`;
    return proxy(targetUrl, c.req);
  });
