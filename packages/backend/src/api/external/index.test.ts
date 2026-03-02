import { describe, expect, it, vi } from "vitest";

vi.mock("hono-openapi", () => ({
  openAPIRouteHandler: () => (c: { json: (arg: unknown) => unknown }) =>
    c.json({ openapi: "3.1.0", info: { version: "v1" } }),
}));

vi.mock("./collections", async () => {
  const { Hono } = await import("hono");
  const app = new Hono().get("/collections/:collectionId/documents", (c) => c.json({ data: [] }));
  return { CollectionsApi: app };
});

import { ExternalApi } from "./index";

describe("ExternalApi", () => {
  it("serves generated openapi schema", async () => {
    const res = await ExternalApi.request("/openapi.json");
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { openapi: string; info: { version: string } };
    expect(payload.openapi).toBe("3.1.0");
    expect(payload.info.version).toBe("v1");
  });

  it("still mounts collections routes", async () => {
    const res = await ExternalApi.request("/collections/blog/documents");
    expect(res.status).toBe(200);
  });
});
