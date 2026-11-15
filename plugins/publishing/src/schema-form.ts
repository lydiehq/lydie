// Forms from the JSON Schemas connectors publish (credentials, connection settings, publication
// config): which fields to show, their initial values, validation, and the value to send.

export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  default?: unknown;
  description?: string;
  title?: string;
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  writeOnly?: boolean;
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
};

// "list": an array, edited as checkboxes when its items are an enum, else comma-separated text.
export type FieldKind = "text" | "secret" | "url" | "number" | "boolean" | "enum" | "list" | "map";

export type Field = {
  key: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  description: string | null;
  options: string[];
  schema: JsonSchema;
};

// Values while editing: strings for text-like fields, booleans, and key/value lines for maps.
export type FormValues = Record<string, string | boolean>;

const SECRET = /token|password|secret|key$/i;

// "applicationPassword" → "Application password"; "contentDir" → "Content dir"; "apiUrl" → "API URL".
export function labelOf(key: string, schema: JsonSchema): string {
  if (schema.title) return schema.title;
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .split(" ")
    .map((w) => (["url", "api", "id"].includes(w) ? w.toUpperCase() : w));
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function typeOf(schema: JsonSchema): string | undefined {
  return Array.isArray(schema.type) ? schema.type.find((t) => t !== "null") : schema.type;
}

export function fieldsOf(schema: JsonSchema | null | undefined): Field[] {
  if (!schema?.properties) return [];
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties).map(([key, s]) => {
    const type = typeOf(s);
    const kind: FieldKind = s.enum
      ? "enum"
      : type === "boolean"
        ? "boolean"
        : type === "array"
          ? "list"
          : type === "number" || type === "integer"
            ? "number"
            : type === "object"
              ? "map"
              : s.writeOnly || s.format === "password" || SECRET.test(key)
                ? "secret"
                : s.format === "uri"
                  ? "url"
                  : "text";
    return {
      key,
      label: labelOf(key, s),
      kind,
      required: required.has(key),
      description: s.description ?? null,
      options: (s.enum ?? s.items?.enum ?? []).map(String),
      schema: s,
    };
  });
}

// Editing values from a stored object (or the schema's defaults).
export function initialValues(
  fields: readonly Field[],
  current: Record<string, unknown> = {},
): FormValues {
  const out: FormValues = {};
  for (const f of fields) {
    const value = current[f.key] ?? f.schema.default;
    if (f.kind === "boolean") out[f.key] = value === true;
    else if (f.kind === "list")
      out[f.key] = Array.isArray(value) ? value.map(String).join(",") : "";
    else if (f.kind === "map") {
      out[f.key] = Object.entries((value as Record<string, unknown>) ?? {})
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join("\n");
    } else {
      out[f.key] =
        value === undefined || value === null
          ? ""
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value as string | number | boolean);
    }
  }
  return out;
}

// Problems by field key; empty when the values can be sent.
export function validate(fields: readonly Field[], values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const value = values[f.key];
    if (f.kind === "boolean" || f.kind === "map" || f.kind === "list") continue;
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
      if (f.required) errors[f.key] = "Required";
      continue;
    }
    const s = f.schema;
    if (f.kind === "number") {
      const n = Number(text);
      if (!Number.isFinite(n)) errors[f.key] = "Enter a number";
      else if (s.minimum !== undefined && n < s.minimum) errors[f.key] = `At least ${s.minimum}`;
      else if (s.maximum !== undefined && n > s.maximum) errors[f.key] = `At most ${s.maximum}`;
      continue;
    }
    if (f.kind === "enum" && !f.options.includes(text)) errors[f.key] = "Choose one of the options";
    else if (s.minLength !== undefined && text.length < s.minLength) {
      errors[f.key] = `At least ${s.minLength} characters`;
    } else if (s.maxLength !== undefined && text.length > s.maxLength) {
      errors[f.key] = `At most ${s.maxLength} characters`;
    } else if (f.kind === "url" && !/^https?:\/\/\S+$/.test(text)) {
      errors[f.key] = "Enter a full URL (https://…)";
    } else if (s.pattern && !new RegExp(s.pattern, "u").test(text)) {
      errors[f.key] = s.description ? `Should be: ${s.description}` : "Not in the expected format";
    }
  }
  return errors;
}

// The object to send: typed values, empty optional fields left out.
export function toValue(fields: readonly Field[], values: FormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const value = values[f.key];
    if (f.kind === "boolean") {
      out[f.key] = value === true;
      continue;
    }
    const text = typeof value === "string" ? value.trim() : "";
    if (f.kind === "list") {
      out[f.key] = text
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      continue;
    }
    if (f.kind === "map") {
      const map: Record<string, string> = {};
      for (const line of text.split("\n")) {
        const at = line.indexOf(":");
        if (at > 0) map[line.slice(0, at).trim()] = line.slice(at + 1).trim();
      }
      if (Object.keys(map).length) out[f.key] = map;
      continue;
    }
    if (!text) continue;
    out[f.key] = f.kind === "number" ? Number(text) : text;
  }
  return out;
}
