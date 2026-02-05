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

      const responseHeaders = new Headers();
      response.headers.forEach((value, key) => {
        if (!["content-encoding", "transfer-encoding"].includes(key.toLowerCase())) {
          responseHeaders.set(key, value);
        }
      });

      responseHeaders.set("Access-Control-Allow-Origin", "*");
      responseHeaders.set("Cache-Control", "public, max-age=31536000, immutable");

      const body = await response.arrayBuffer();

      return new Response(body, {
        status: response.status,
        headers: responseHeaders,
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
      // Build headers, preserving content-encoding for gzip compression
      const requestHeaders: Record<string, string> = {
        "User-Agent": c.req.header("user-agent") || "",
      };

      const contentType = c.req.header("content-type");
      if (contentType) {
        requestHeaders["Content-Type"] = contentType;
      }

      const contentEncoding = c.req.header("content-encoding");
      if (contentEncoding) {
        requestHeaders["Content-Encoding"] = contentEncoding;
      }

      // Read body as raw bytes to preserve gzip compression
      let requestBody: ArrayBuffer | undefined;
      if (c.req.method !== "GET" && c.req.method !== "HEAD") {
        requestBody = await c.req.arrayBuffer();
      }

      const response = await fetch(targetUrl, {
        method: c.req.method,
        headers: requestHeaders,
        body: requestBody,
      });

      const responseHeaders = new Headers();
      response.headers.forEach((value, key) => {
        if (!["content-encoding", "transfer-encoding"].includes(key.toLowerCase())) {
          responseHeaders.set(key, value);
        }
      });

      responseHeaders.set("Access-Control-Allow-Origin", c.req.header("origin") || "*");
      responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      responseHeaders.set("Access-Control-Allow-Credentials", "true");

      const responseBody = await response.text();
      
      return new Response(responseBody, {
        status: response.status,
        headers: responseHeaders,
      });
    } catch (error) {
      console.error("[PostHog Proxy] Error:", error);
      return c.json({ error: "Proxy error" }, 500);
    }
  });
