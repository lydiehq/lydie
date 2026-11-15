import { z } from "zod";

export type JsonSchema = { [key: string]: unknown };

export type Converted = {
  schema: JsonSchema;
  // Named schemas (from `.meta({ id })`) referenced by `schema`.
  defs: Record<string, JsonSchema>;
};

// Converts a Zod schema to JSON Schema 2020-12. `refPrefix` decides where named schemas live:
// `#/$defs/` keeps the result self-contained (MCP), `#/components/schemas/` suits OpenAPI.
export function toJsonSchema(
  schema: z.ZodType,
  io: "input" | "output",
  refPrefix = "#/$defs/",
): Converted {
  const { $schema: _ignored, $defs, ...rest } = convert(schema, io);
  let defs = ($defs ?? {}) as Record<string, JsonSchema>;
  let root: JsonSchema = rest;
  // A named schema with defaults has different input and output JSON Schemas (fields with
  // defaults are optional in inputs). The input variant is named `<Name>Input` so both can live in
  // one document (OpenAPI components) without colliding.
  if (io === "input") {
    const outputs = (convert(schema, "output").$defs ?? {}) as Record<string, JsonSchema>;
    const renamed = new Map<string, string>();
    for (const [name, def] of Object.entries(defs)) {
      const out = outputs[name];
      if (out && JSON.stringify(out) !== JSON.stringify(def)) renamed.set(name, `${name}Input`);
    }
    if (renamed.size > 0) {
      const rename = (value: JsonSchema) => renameRefs(value, renamed);
      defs = Object.fromEntries(
        Object.entries(defs).map(([name, def]) => [renamed.get(name) ?? name, rename(def)]),
      );
      root = rename(root);
    }
  }
  return { schema: rewriteRefs(root, refPrefix), defs: rewriteRefs(defs, refPrefix) };
}

function convert(schema: z.ZodType, io: "input" | "output"): JsonSchema {
  return z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io,
    unrepresentable: "throw",
    // Refinements (e.g. "exactly one of") cannot be expressed; they are documented in descriptions.
    cycles: "throw",
    reused: "inline",
  }) as JsonSchema;
}

function renameRefs<T>(value: T, renamed: ReadonlyMap<string, string>): T {
  if (Array.isArray(value)) return value.map((v) => renameRefs(v, renamed)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      const target = key === "$ref" && typeof v === "string" ? v.slice("#/$defs/".length) : null;
      out[key] =
        target !== null && renamed.has(target)
          ? `#/$defs/${renamed.get(target)}`
          : renameRefs(v, renamed);
    }
    return out as T;
  }
  return value;
}

function rewriteRefs<T>(value: T, prefix: string): T {
  if (Array.isArray(value)) return value.map((v) => rewriteRefs(v, prefix)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] =
        key === "$ref" && typeof v === "string" && v.startsWith("#/$defs/")
          ? prefix + v.slice("#/$defs/".length)
          : rewriteRefs(v, prefix);
    }
    return out as T;
  }
  return value;
}

export function objectProperties(schema: JsonSchema): {
  properties: Record<string, JsonSchema>;
  required: string[];
} {
  if (schema.type !== "object") throw new Error("Operation inputs must be objects");
  return {
    properties: (schema.properties ?? {}) as Record<string, JsonSchema>,
    required: (schema.required ?? []) as string[],
  };
}
