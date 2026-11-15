import type { AnyOperation } from "../define.ts";
import type { Registry } from "../registry.ts";
import { objectProperties, toJsonSchema } from "./json-schema.ts";
import type { JsonSchema } from "./json-schema.ts";

export type CliValueType = "string" | "number" | "integer" | "boolean" | "json";

export type CliOption = {
  // Input field the value is assigned to.
  key: string;
  // `--kebab-case` flag name (without dashes) for flags, the key for positional args.
  name: string;
  type: CliValueType;
  required: boolean;
  nullable: boolean;
  description?: string;
  default?: unknown;
};

export type CliCommand = {
  command: string[];
  operation: string;
  summary: string;
  description?: string;
  readOnly: boolean;
  destructive: boolean;
  args: CliOption[];
  flags: CliOption[];
};

export function toCliCommands(registry: Registry): CliCommand[] {
  return Object.values(registry)
    .filter((op) => op.cli && !op.internal)
    .map(toCliCommand);
}

export function toCliCommand(op: AnyOperation): CliCommand {
  const cli = op.cli;
  if (!cli) throw new Error(`${op.id} has no CLI projection`);
  const { schema, defs } = toJsonSchema(op.input, "input");
  const { properties, required } = objectProperties(schema);
  const positional = cli.args ?? [];
  for (const key of positional) {
    if (!properties[key]) throw new Error(`${op.id}: CLI arg "${key}" is not an input field`);
  }
  const option = (key: string, name: string): CliOption => {
    const prop = resolve(properties[key]!, defs);
    const { type, nullable } = valueType(prop, defs);
    return {
      key,
      name,
      type,
      required: required.includes(key),
      nullable,
      ...(typeof prop.description === "string" ? { description: prop.description } : {}),
      ...("default" in prop ? { default: prop.default } : {}),
    };
  };
  return {
    command: [...cli.command],
    operation: op.id,
    summary: op.summary,
    ...(op.description ? { description: op.description } : {}),
    readOnly: op.readOnly,
    destructive: op.destructive,
    args: positional.map((key) => option(key, key)),
    flags: Object.keys(properties)
      .filter((key) => !positional.includes(key))
      .map((key) => option(key, kebab(key))),
  };
}

function resolve(schema: JsonSchema, defs: Record<string, JsonSchema>): JsonSchema {
  const ref = schema.$ref;
  if (typeof ref !== "string") return schema;
  const target = defs[ref.slice("#/$defs/".length)];
  if (!target) throw new Error(`Unresolved ${ref}`);
  const { $ref: _ref, ...rest } = schema;
  return { ...resolve(target, defs), ...rest };
}

function valueType(
  schema: JsonSchema,
  defs: Record<string, JsonSchema>,
): { type: CliValueType; nullable: boolean } {
  const variants = Array.isArray(schema.anyOf)
    ? (schema.anyOf as JsonSchema[]).map((v) => resolve(v, defs))
    : [schema];
  const types = variants.flatMap((v) => (Array.isArray(v.type) ? v.type : [v.type]));
  const nullable = types.includes("null");
  const rest = types.filter((t) => t !== "null");
  if (rest.length === 1 && ["string", "number", "integer", "boolean"].includes(rest[0] as string)) {
    return { type: rest[0] as CliValueType, nullable };
  }
  return { type: "json", nullable };
}

function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
