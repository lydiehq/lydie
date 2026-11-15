// Destinations for the publishing e2e, on free local ports: a webhook receiver that checks the
// Standard Webhooks signature (https://www.standardwebhooks.com) and keeps the events, and a small
// WordPress REST API (application-password auth, posts, terms, media) whose posts the test can edit
// "on the site" to make a publication diverge.
import { createHmac, timingSafeEqual } from "node:crypto";

export type WebhookDelivery = {
  id: string;
  // Checked against the secret the test learns after connecting (the connect test arrives first).
  readonly verified: boolean;
  type: string;
  data: Record<string, unknown>;
};

export function startWebhookReceiver() {
  const deliveries: WebhookDelivery[] = [];
  let secret: string | null = null;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (request.method !== "POST") return new Response("POST only", { status: 405 });
      const body = await request.text();
      const id = request.headers.get("webhook-id") ?? "";
      const timestamp = request.headers.get("webhook-timestamp") ?? "";
      const signatures = request.headers.get("webhook-signature") ?? "";
      const event = JSON.parse(body) as { type: string; data: Record<string, unknown> };
      deliveries.push({
        id,
        type: event.type,
        data: event.data,
        get verified() {
          if (!secret) return false;
          const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
          const mac = createHmac("sha256", key)
            .update(`${id}.${timestamp}.${body}`)
            .digest("base64");
          const expected = Buffer.from(`v1,${mac}`);
          return signatures.split(" ").some((candidate) => {
            const given = Buffer.from(candidate);
            return given.length === expected.length && timingSafeEqual(given, expected);
          });
        },
      });
      return new Response(null, { status: 204 });
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}/hooks`,
    deliveries,
    // The secret the person copied after connecting.
    setSecret(value: string) {
      secret = value;
    },
    stop: () => void server.stop(true),
  };
}

type Post = {
  id: number;
  slug: string;
  status: string;
  title: string;
  content: string;
  excerpt: string;
  type: "posts" | "pages";
};

export function startWordPress(credentials: { username: string; password: string }) {
  const posts = new Map<number, Post>();
  let nextId = 100;
  const requests: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      requests.push(`${request.method} ${url.pathname}`);
      const json = (value: unknown, status = 200) => Response.json(value, { status });
      const fail = (status: number, code: string, message: string) =>
        json({ code, message, data: { status } }, status);
      const auth = request.headers.get("authorization") ?? "";
      const expected = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`;
      if (auth !== expected) {
        return fail(
          401,
          "incorrect_password",
          "The provided password is an invalid application password.",
        );
      }
      const route = url.pathname.replace(/^\/wp-json\/wp\/v2/, "");
      const base = url.origin;
      const out = (p: Post) => ({
        id: p.id,
        slug: p.slug,
        status: p.status,
        link: `${base}/${p.slug}/`,
        title: { raw: p.title, rendered: p.title },
        content: { raw: p.content, rendered: p.content },
        excerpt: { raw: p.excerpt, rendered: p.excerpt },
      });
      if (route === "/users/me") {
        return json({
          id: 1,
          slug: credentials.username,
          name: credentials.username,
          capabilities: { publish_posts: true, upload_files: true },
        });
      }
      if (route === "/categories" || route === "/tags") {
        return request.method === "POST" ? json({ id: nextId++ }, 201) : json([]);
      }
      if (route === "/media") return json({ id: nextId++, source_url: `${base}/media.png` }, 201);
      const collection = /^\/(posts|pages)$/.exec(route);
      const one = /^\/(posts|pages)\/(\d+)$/.exec(route);
      if (collection && request.method === "GET") {
        const slug = url.searchParams.get("slug");
        return json(
          [...posts.values()]
            .filter((p) => p.type === collection[1] && p.status !== "trash")
            .filter((p) => !slug || p.slug === slug)
            .map(out),
        );
      }
      if (collection && request.method === "POST") {
        const body = (await request.json()) as Partial<Post>;
        const post: Post = {
          id: nextId++,
          type: collection[1] as Post["type"],
          slug: body.slug ?? `post-${nextId}`,
          status: body.status ?? "draft",
          title: body.title ?? "",
          content: body.content ?? "",
          excerpt: body.excerpt ?? "",
        };
        posts.set(post.id, post);
        return json(out(post), 201);
      }
      const post = one ? posts.get(Number(one[2])) : undefined;
      if (one && !post) return fail(404, "rest_post_invalid_id", "Invalid post ID.");
      if (post && request.method === "GET") return json(out(post));
      if (post && request.method === "POST") {
        const body = (await request.json()) as Partial<Post>;
        Object.assign(post, {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.content !== undefined ? { content: body.content } : {}),
          ...(body.excerpt !== undefined ? { excerpt: body.excerpt } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.slug !== undefined ? { slug: body.slug } : {}),
        });
        return json(out(post));
      }
      if (post && request.method === "DELETE") {
        post.status = "trash";
        return json(out(post));
      }
      return fail(404, "rest_no_route", "No route was found matching the URL and request method.");
    },
  });
  return {
    siteUrl: `http://127.0.0.1:${server.port}`,
    posts,
    requests,
    // An edit made in WordPress itself.
    edit(id: number, change: (post: Post) => void) {
      const post = posts.get(id);
      if (!post) throw new Error(`No post ${id}`);
      change(post);
    },
    setPassword(password: string) {
      credentials.password = password;
    },
    stop: () => void server.stop(true),
  };
}
