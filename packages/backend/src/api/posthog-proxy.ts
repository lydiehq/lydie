import { Hono } from "hono";

const POSTHOG_API_URL = "https://us.i.posthog.com";
const POSTHOG_ASSETS_URL = "https://us-assets.i.posthog.com";

export const PostHogProxy = new Hono()
  .all("/static/*", async (c) => {
    const path = c.req.path.replace(/^\/ingest/, "");
    const targetUrl = `${POSTHOG_ASSETS_URL}${path}`;

    try {
      const response = await fetch(targetUrl, {
        method: c.req.method,
        headers: {
          "User-Agent": c.req.header("user-agent") || "",
        },
      });

      const headers = new Headers();
      response.headers.forEach((value, key) => {
        if (!["content-encoding", "transfer-encoding"].includes(key.toLowerCase())) {
          headers.set(key, value);
        }
      });

      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Cache-Control", "public, max-age=31536000, immutable");

      const body = await response.arrayBuffer();

      return new Response(body, {
        status: response.status,
        headers,
      });
    } catch (error) {
      console.error("[PostHog Proxy] Asset error:", error);
      return c.json({ error: "Proxy error" }, 500);
    }
  })
  .all("/*", async (c) => {
    const path = c.req.path.replace(/^\/ingest/, "");
    const targetUrl = `${POSTHOG_API_URL}${path}`;

    try {
      const response = await fetch(targetUrl, {
        method: c.req.method,
        headers: {
          "Content-Type": c.req.header("content-type") || "application/json",
          "User-Agent": c.req.header("user-agent") || "",
        },
        body: c.req.method !== "GET" && c.req.method !== "HEAD" 
          ? await c.req.text()
          : undefined,
      });

      const headers = new Headers();
      response.headers.forEach((value, key) => {
        if (!["content-encoding", "transfer-encoding"].includes(key.toLowerCase())) {
          headers.set(key, value);
        }
      });

      headers.set("Access-Control-Allow-Origin", c.req.header("origin") || "*");
      headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      headers.set("Access-Control-Allow-Credentials", "true");

      const body = await response.text();
      
      return new Response(body, {
        status: response.status,
        headers,
      });
    } catch (error) {
      console.error("[PostHog Proxy] Error:", error);
      return c.json({ error: "Proxy error" }, 500);
    }
  });
