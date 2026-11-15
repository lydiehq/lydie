// Generates the hosted API client types from the core's OpenAPI document.
//
//   bun scripts/generate.ts                 # fetch http://localhost:4100/v1/openapi.json
//   bun scripts/generate.ts --url <url>     # another server
//   bun scripts/generate.ts --snapshot      # regenerate from the committed openapi.json
//   bun scripts/generate.ts --check         # fail if the generated files differ from the snapshot's
//
// Writes:
//   openapi.json                               the document it was generated from (committed)
//   src/generated.ts                           every operation: types and the route table
//   ../plugin-api/src/hosted-operations.ts     types of the operations only the hosted API has
//                                              (not in @lydie/contract), for plugins
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Schema = {
  $ref?: string;
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  anyOf?: Schema[];
  oneOf?: Schema[];
  allOf?: Schema[];
  description?: string;
};

type Parameter = { $ref?: string; name: string; in: string; required?: boolean; schema: Schema };

type Operation = {
  operationId: string;
  summary?: string;
  parameters?: Parameter[];
  requestBody?: { content?: { "application/json"?: { schema: Schema } } };
  responses: Record<string, { content?: { "application/json"?: { schema: Schema } } }>;
};

type OpenApi = {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema> };
};

const ROOT = join(import.meta.dir, "..");
const SNAPSHOT = join(ROOT, "openapi.json");
const SDK_OUT = join(ROOT, "src", "generated.ts");
const PLUGIN_OUT = join(ROOT, "..", "plugin-api", "src", "hosted-operations.ts");
const CONTRACT_OPENAPI = join(ROOT, "..", "contract", "generated", "openapi.json");

const refName = (ref: string) => ref.replace("#/components/schemas/", "");
const key = (name: string) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name));

export function toType(schema: Schema | boolean | undefined, refs?: Set<string>): string {
  if (schema === undefined || schema === true) return "unknown";
  if (schema === false) return "never";
  if (schema.$ref) {
    const name = refName(schema.$ref);
    refs?.add(name);
    return name;
  }
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (schema.anyOf || schema.oneOf) {
    return union((schema.anyOf ?? schema.oneOf)!.map((s) => toType(s, refs)));
  }
  if (schema.allOf) return schema.allOf.map((s) => wrap(toType(s, refs))).join(" & ");
  if (Array.isArray(schema.type)) {
    return union(schema.type.map((t) => toType({ ...schema, type: t }, refs)));
  }
  switch (schema.type) {
    case "string":
      return "string";
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "array":
      return `${wrap(toType(schema.items, refs))}[]`;
    case "object":
      return objectType(schema, refs);
    default:
      return schema.properties ? objectType(schema, refs) : "unknown";
  }
}

function objectType(schema: Schema, refs?: Set<string>): string {
  const props = Object.entries(schema.properties ?? {});
  const required = new Set(schema.required ?? []);
  const extra =
    schema.additionalProperties === undefined || schema.additionalProperties === false
      ? null
      : toType(
          schema.additionalProperties === true ? undefined : schema.additionalProperties,
          refs,
        );
  if (props.length === 0) return `Record<string, ${extra ?? "unknown"}>`;
  const body = props
    .map(([name, s]) => `${key(name)}${required.has(name) ? "" : "?"}: ${toType(s, refs)}`)
    .join("; ");
  return extra ? `{ ${body} } & Record<string, ${extra}>` : `{ ${body} }`;
}

function union(types: string[]): string {
  const unique = [...new Set(types)];
  return unique.length === 1 ? unique[0]! : unique.map(wrap).join(" | ");
}

function wrap(type: string): string {
  return /[|&]/.test(type) && !/^[{(]/.test(type) ? `(${type})` : type;
}

type OperationInfo = {
  id: string;
  method: string;
  path: string;
  summary: string;
  pathParams: string[];
  queryParams: string[];
  input: string;
  output: string;
  refs: Set<string>;
};

export function collect(doc: OpenApi): OperationInfo[] {
  const out: OperationInfo[] = [];
  for (const [path, methods] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (!op.operationId) continue;
      const refs = new Set<string>();
      const params = (op.parameters ?? []).filter((p) => !p.$ref && p.in !== "header");
      const fields: string[] = [];
      for (const p of params) {
        fields.push(`${key(p.name)}${p.required ? "" : "?"}: ${toType(p.schema, refs)}`);
      }
      const body = op.requestBody?.content?.["application/json"]?.schema;
      let input = fields.length ? `{ ${fields.join("; ")} }` : "";
      if (body) {
        const bodyType = toType(body, refs);
        input = input ? `${input} & ${wrap(bodyType)}` : bodyType;
      }
      const ok = op.responses["200"] ?? op.responses["201"];
      const response = ok?.content?.["application/json"]?.schema;
      out.push({
        id: op.operationId,
        method: method.toUpperCase(),
        path,
        summary: op.summary ?? "",
        pathParams: params.filter((p) => p.in === "path").map((p) => p.name),
        queryParams: params.filter((p) => p.in === "query").map((p) => p.name),
        input: input || "Record<string, never>",
        output: response ? toType(response, refs) : "null",
        refs,
      });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// Component schemas reachable from `names`.
function closure(doc: OpenApi, names: Iterable<string>): string[] {
  const seen = new Set<string>();
  const queue = [...names];
  while (queue.length) {
    const name = queue.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const refs = new Set<string>();
    toType(doc.components.schemas[name], refs);
    queue.push(...refs);
  }
  return [...seen].sort();
}

const HEADER =
  "// Generated by @lydie/sdk's scripts/generate.ts from the hosted API's OpenAPI document. Do not edit.\n";

function emitSchemas(doc: OpenApi, names: string[]): string {
  return names
    .map((name) => {
      const schema = doc.components.schemas[name]!;
      const comment = schema.description ? `// ${schema.description.split("\n")[0]}\n` : "";
      return `${comment}export type ${name} = ${toType(schema)};\n`;
    })
    .join("\n");
}

function emitOperationTypes(ops: OperationInfo[], typeName: string): string {
  const lines = ops.map(
    (op) =>
      `  // ${op.method} ${op.path}${op.summary ? `: ${op.summary}` : ""}\n  ${JSON.stringify(op.id)}: { input: ${op.input}; output: ${op.output} };`,
  );
  return `export type ${typeName} = {\n${lines.join("\n")}\n};\n`;
}

export function generate(doc: OpenApi, contractIds: Set<string>) {
  const ops = collect(doc);
  const all = closure(doc, Object.keys(doc.components.schemas));
  const table = ops
    .map(
      (op) =>
        `  ${JSON.stringify(op.id)}: { method: ${JSON.stringify(op.method)}, path: ${JSON.stringify(op.path)}, query: ${JSON.stringify(op.queryParams)} },`,
    )
    .join("\n");
  const sdk = `${HEADER}/* oxlint-disable */\n\n${emitSchemas(doc, all)}\n${emitOperationTypes(ops, "ApiOperations")}\nexport type ApiOperationId = keyof ApiOperations;\n\n// Route of every operation: path parameters are \`{name}\` in \`path\`; \`query\` lists the query\n// parameters of GET and DELETE (everything else goes in the JSON body).\nexport const apiRoutes = {\n${table}\n} as const satisfies Record<ApiOperationId, { method: string; path: string; query: readonly string[] }>;\n`;

  const hosted = ops.filter((op) => !contractIds.has(op.id));
  const hostedNames = closure(
    doc,
    hosted.flatMap((op) => [...op.refs]),
  );
  const plugin = `${HEADER}// The operations only the hosted API has (team, sharing, publishing), for \`app.account.call\`.\n// The contract's own operations are typed by \`@lydie/contract\`.\n/* oxlint-disable */\n\n${emitSchemas(doc, hostedNames)}\n${emitOperationTypes(hosted, "HostedOperations")}\nexport type HostedOperationId = keyof HostedOperations;\nexport type HostedInput<K extends HostedOperationId> = HostedOperations[K]["input"];\nexport type HostedOutput<K extends HostedOperationId> = HostedOperations[K]["output"];\n`;
  return { sdk, plugin };
}

async function format(paths: string[]) {
  const proc = Bun.spawn(["bun", "fmt", ...paths], { cwd: ROOT, stdout: "ignore", stderr: "pipe" });
  if ((await proc.exited) !== 0) throw new Error(await new Response(proc.stderr).text());
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const fromSnapshot = check || args.includes("--snapshot");
  const urlIndex = args.indexOf("--url");
  const url = urlIndex === -1 ? "http://localhost:4100/v1/openapi.json" : args[urlIndex + 1]!;
  const text = fromSnapshot
    ? readFileSync(SNAPSHOT, "utf8")
    : await (await fetch(url)).text().catch((error: unknown) => {
        throw new Error(`Could not fetch ${url} (is the hosted API running?): ${String(error)}`);
      });
  const doc = JSON.parse(text) as OpenApi;
  const contract = JSON.parse(readFileSync(CONTRACT_OPENAPI, "utf8")) as OpenApi;
  const contractIds = new Set(
    Object.values(contract.paths).flatMap((m) => Object.values(m).map((op) => op.operationId)),
  );
  const { sdk, plugin } = generate(doc, contractIds);
  if (check) {
    const tmp = join(ROOT, "node_modules", ".sdk-check");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(tmp, { recursive: true });
    const a = join(tmp, "generated.ts");
    const b = join(tmp, "hosted-operations.ts");
    writeFileSync(a, sdk);
    writeFileSync(b, plugin);
    await format([a, b]);
    const drift = [
      [a, SDK_OUT],
      [b, PLUGIN_OUT],
    ].filter(
      ([fresh, committed]) => readFileSync(fresh!, "utf8") !== readFileSync(committed!, "utf8"),
    );
    if (drift.length) {
      console.error(`Generated files are out of date: ${drift.map(([, c]) => c).join(", ")}`);
      process.exit(1);
    }
    console.log("Generated files are up to date");
  } else {
    if (!fromSnapshot) writeFileSync(SNAPSHOT, `${JSON.stringify(doc, null, 2)}\n`);
    writeFileSync(SDK_OUT, sdk);
    writeFileSync(PLUGIN_OUT, plugin);
    await format(fromSnapshot ? [SDK_OUT, PLUGIN_OUT] : [SNAPSHOT, SDK_OUT, PLUGIN_OUT]);
    console.log(`Wrote ${SDK_OUT} and ${PLUGIN_OUT}`);
  }
}
