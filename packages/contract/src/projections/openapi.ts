import type { AnyOperation } from "../define.ts";
import { ErrorEnvelope } from "../errors.ts";
import type { Registry } from "../registry.ts";
import { LYDIE_VERSION, LYDIE_VERSION_HEADER } from "../version.ts";
import { isDeepStrictEqual } from "./equal.ts";
import { objectProperties, toJsonSchema } from "./json-schema.ts";
import type { JsonSchema } from "./json-schema.ts";

const COMPONENTS = "#/components/schemas/";
const PRIMITIVE_TYPES = new Set(["string", "number", "integer", "boolean"]);

export type OpenApiDocument = {
  openapi: "3.1.0";
  info: { title: string; version: string; description: string };
  servers: { url: string }[];
  paths: Record<string, Record<string, unknown>>;
  components: {
    schemas: Record<string, JsonSchema>;
    parameters: Record<string, unknown>;
    securitySchemes: Record<string, unknown>;
  };
  security: Record<string, string[]>[];
};

export function toOpenApi(registry: Registry): OpenApiDocument {
  const schemas: Record<string, JsonSchema> = {};
  const addDefs = (defs: Record<string, JsonSchema>, where: string) => {
    for (const [name, schema] of Object.entries(defs)) {
      const existing = schemas[name];
      if (existing && !isDeepStrictEqual(existing, schema)) {
        throw new Error(`${where}: schema "${name}" differs between uses (input vs output?)`);
      }
      schemas[name] = schema;
    }
  };

  const error = toJsonSchema(ErrorEnvelope, "output", COMPONENTS);
  addDefs(error.defs, "Error");

  const paths: OpenApiDocument["paths"] = {};
  for (const op of Object.values(registry)) {
    if (!op.rest || op.internal) continue;
    const { method, path } = op.rest;
    const pathItem = (paths[path] ??= {});
    const key = method.toLowerCase();
    if (pathItem[key]) throw new Error(`${op.id}: ${method} ${path} is already defined`);
    pathItem[key] = operationObject(op, addDefs);
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Lydie API",
      version: LYDIE_VERSION,
      description:
        `Generated from @lydie/contract. Pin a version with the \`${LYDIE_VERSION_HEADER}\` header ` +
        "(YYYY-MM-DD). Errors use the `{error:{code,message,hint}}` envelope.",
    },
    servers: [{ url: "/v1" }],
    paths: sortKeys(paths),
    components: {
      schemas: sortKeys(schemas),
      parameters: {
        LydieVersion: {
          name: LYDIE_VERSION_HEADER,
          in: "header",
          required: false,
          description: "API version (YYYY-MM-DD). Defaults to the version pinned on the token.",
          schema: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", example: LYDIE_VERSION },
        },
      },
      securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
    },
    security: [{ bearer: [] }],
  };
}

function operationObject(
  op: AnyOperation,
  addDefs: (defs: Record<string, JsonSchema>, where: string) => void,
): Record<string, unknown> {
  const rest = op.rest!;
  const input = toJsonSchema(op.input, "input", COMPONENTS);
  const output = toJsonSchema(op.output, "output", COMPONENTS);
  addDefs(input.defs, op.id);
  addDefs(output.defs, op.id);

  const { properties, required } = objectProperties(input.schema);
  const pathParams = [...rest.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
  const parameters: unknown[] = [{ $ref: "#/components/parameters/LydieVersion" }];
  for (const name of pathParams) {
    const schema = properties[name];
    if (!schema) throw new Error(`${op.id}: path parameter {${name}} is not an input field`);
    parameters.push({ name, in: "path", required: true, schema });
  }

  const remaining = Object.keys(properties).filter((name) => !pathParams.includes(name));
  const inQuery = rest.method === "GET" || rest.method === "DELETE";
  let requestBody: unknown;
  if (inQuery) {
    for (const name of remaining) {
      const schema = properties[name]!;
      if (!isPrimitive(schema)) {
        throw new Error(`${op.id}: query parameter "${name}" must be a primitive`);
      }
      const { description, ...paramSchema } = schema;
      parameters.push({
        name,
        in: "query",
        required: required.includes(name),
        ...(typeof description === "string" ? { description } : {}),
        schema: paramSchema,
      });
    }
  } else if (remaining.length > 0) {
    const body: JsonSchema = {
      ...input.schema,
      properties: Object.fromEntries(remaining.map((name) => [name, properties[name]])),
    };
    const bodyRequired = required.filter((name) => remaining.includes(name));
    if (bodyRequired.length > 0) body.required = bodyRequired;
    else delete body.required;
    requestBody = {
      required: bodyRequired.length > 0,
      content: { "application/json": { schema: body } },
    };
  }

  return {
    operationId: op.id,
    summary: op.summary,
    ...(op.description ? { description: op.description } : {}),
    tags: [op.id.split(".")[0]],
    parameters,
    ...(requestBody ? { requestBody } : {}),
    responses: {
      "200": { description: "OK", content: { "application/json": { schema: output.schema } } },
      default: {
        description: "Error",
        content: { "application/json": { schema: { $ref: `${COMPONENTS}Error` } } },
      },
    },
    "x-lydie-kind": op.kind,
    "x-lydie-scopes": op.scopes,
    "x-lydie-destructive": op.destructive,
    "x-lydie-idempotent": op.idempotent,
    ...(op.kind === "mutation" ? { "x-lydie-undoable": op.undo === "inverse" } : {}),
  };
}

function isPrimitive(schema: JsonSchema): boolean {
  if (typeof schema.$ref === "string") return true;
  const type = schema.type;
  if (typeof type === "string") return PRIMITIVE_TYPES.has(type);
  if (Array.isArray(type)) return type.every((t) => t === "null" || PRIMITIVE_TYPES.has(t));
  return false;
}

function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)));
}
