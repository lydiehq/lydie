import { describe, expect, test } from "bun:test";

import { collect, toType } from "../scripts/generate.ts";
import { createApiCaller, requestFor } from "./client.ts";
import type { ApiRequest } from "./client.ts";

describe("requestFor", () => {
  test("puts path parameters in the path and the rest in the body", () => {
    expect(
      requestFor("member.setRole", { workspaceId: "w 1", userId: "u1", role: "admin" }),
    ).toEqual({
      method: "POST",
      path: "/v1/workspaces/w%201/members/u1/role",
      body: { role: "admin" },
    });
  });

  test("GET sends listed query parameters and no body", () => {
    expect(requestFor("publication.list", { workspaceId: "w1", documentId: "d1" })).toEqual({
      method: "GET",
      path: "/v1/workspaces/w1/publications?documentId=d1",
    });
    expect(requestFor("publication.list", { workspaceId: "w1" }).path).toBe(
      "/v1/workspaces/w1/publications",
    );
  });

  test("a missing path parameter throws", () => {
    expect(() => requestFor("member.list", {})).toThrow("missing workspaceId");
  });

  test("the caller hands the request to the transport", async () => {
    const seen: ApiRequest[] = [];
    const api = createApiCaller(async (request) => {
      seen.push(request);
      return { members: [] };
    });
    await expect(api.call("member.list", { workspaceId: "w1" })).resolves.toEqual({
      members: [],
    });
    expect(seen[0]?.path).toBe("/v1/workspaces/w1/members");
  });
});

describe("generator", () => {
  test("turns JSON Schema into TypeScript", () => {
    expect(toType({ type: ["string", "null"] })).toBe("string | null");
    expect(toType({ enum: ["a", "b"] })).toBe('"a" | "b"');
    expect(toType({ type: "array", items: { $ref: "#/components/schemas/X" } })).toBe("X[]");
    expect(
      toType({
        type: "object",
        properties: { a: { type: "integer" }, "b-c": { type: "boolean" } },
        required: ["a"],
      }),
    ).toBe('{ a: number; "b-c"?: boolean }');
    expect(toType({ type: "object", additionalProperties: {} })).toBe("Record<string, unknown>");
    expect(toType({ anyOf: [{ type: "string" }, { type: "null" }] })).toBe("string | null");
    expect(toType({})).toBe("unknown");
  });

  test("merges path, query and body into one input", () => {
    const [op] = collect({
      components: { schemas: {} },
      paths: {
        "/w/{id}": {
          post: {
            operationId: "x.y",
            parameters: [
              { name: "id", in: "path", required: true, schema: { type: "string" } },
              { name: "Lydie-Version", in: "header", schema: { type: "string" } },
            ],
            requestBody: {
              content: {
                "application/json": {
                  schema: { type: "object", properties: { n: { type: "number" } } },
                },
              },
            },
            responses: { "200": { content: { "application/json": { schema: { type: "null" } } } } },
          },
        },
      },
    });
    expect(op?.input).toBe("{ id: string } & { n?: number }");
    expect(op?.output).toBe("null");
    expect(op?.pathParams).toEqual(["id"]);
  });
});
