import { describe, expect, test } from "bun:test";

import { fieldsOf, initialValues, labelOf, toValue, validate } from "./schema-form.ts";
import type { JsonSchema } from "./schema-form.ts";

// Shapes as the hosted API's connector list publishes them.
const credentials: JsonSchema = {
  type: "object",
  properties: {
    username: { type: "string", minLength: 1 },
    applicationPassword: { type: "string", minLength: 8 },
  },
  required: ["username", "applicationPassword"],
};

const config: JsonSchema = {
  type: "object",
  properties: {
    repository: { description: "owner/name", type: "string", pattern: "^[\\w.-]+\\/[\\w.-]+$" },
    branch: { default: "main", type: "string" },
    apiUrl: { type: "string", format: "uri" },
    preset: { default: "plain", type: "string", enum: ["plain", "astro", "hugo"] },
    nested: { default: false, type: "boolean" },
    depth: { type: "integer", minimum: 1, maximum: 5 },
    fields: { type: "object", additionalProperties: { type: "string" } },
  },
  required: ["repository"],
};

describe("forms from JSON Schema", () => {
  test("arrays of options are lists", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        include: {
          default: ["markdown", "html"],
          type: "array",
          items: { type: "string", enum: ["markdown", "html"] },
        },
      },
    };
    const fields = fieldsOf(schema);
    expect(fields[0]).toMatchObject({ kind: "list", options: ["markdown", "html"] });
    const values = initialValues(fields);
    expect(values).toEqual({ include: "markdown,html" });
    expect(toValue(fields, { include: "html" })).toEqual({ include: ["html"] });
    expect(toValue(fields, { include: "" })).toEqual({ include: [] });
  });

  test("derives fields, kinds and labels", () => {
    expect(fieldsOf(credentials).map((f) => [f.key, f.kind, f.label, f.required])).toEqual([
      ["username", "text", "Username", true],
      ["applicationPassword", "secret", "Application password", true],
    ]);
    expect(fieldsOf(config).map((f) => f.kind)).toEqual([
      "text",
      "text",
      "url",
      "enum",
      "boolean",
      "number",
      "map",
    ]);
    expect(fieldsOf(config).find((f) => f.key === "preset")?.options).toEqual([
      "plain",
      "astro",
      "hugo",
    ]);
    expect(labelOf("apiUrl", {})).toBe("API URL");
    expect(fieldsOf(null)).toEqual([]);
  });

  test("starts from stored values, else defaults", () => {
    const fields = fieldsOf(config);
    expect(initialValues(fields)).toEqual({
      repository: "",
      branch: "main",
      apiUrl: "",
      preset: "plain",
      nested: false,
      depth: "",
      fields: "",
    });
    expect(initialValues(fields, { repository: "a/b", fields: { title: "name" } })).toMatchObject({
      repository: "a/b",
      fields: "title: name",
    });
  });

  test("validates required, length, pattern, URL and number bounds", () => {
    const fields = fieldsOf(config);
    const values = {
      ...initialValues(fields),
      repository: "not a repo",
      apiUrl: "ftp:x",
      depth: "9",
    };
    expect(validate(fields, values)).toEqual({
      repository: "Should be: owner/name",
      apiUrl: "Enter a full URL (https://…)",
      depth: "At most 5",
    });
    expect(validate(fieldsOf(credentials), { username: "", applicationPassword: "short" })).toEqual(
      {
        username: "Required",
        applicationPassword: "At least 8 characters",
      },
    );
    expect(validate(fields, { ...initialValues(fields), repository: "me/site" })).toEqual({});
  });

  test("sends typed values and leaves out empty optional ones", () => {
    const fields = fieldsOf(config);
    expect(
      toValue(fields, {
        ...initialValues(fields),
        repository: " me/site ",
        depth: "3",
        nested: true,
        fields: "title: name\nbad line\ndate: published",
      }),
    ).toEqual({
      repository: "me/site",
      branch: "main",
      preset: "plain",
      nested: true,
      depth: 3,
      fields: { title: "name", date: "published" },
    });
  });
});
