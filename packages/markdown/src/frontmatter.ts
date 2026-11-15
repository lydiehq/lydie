// YAML frontmatter: split it off the body, read it as properties, and edit single keys without
// touching the bytes of the others.
import { isMap, isScalar, parseDocument, stringify } from "yaml";

export type Properties = Record<string, unknown>;

export type Frontmatter = {
  // [from, to) in the source, covering the opening `---` line through the closing line's line ending.
  from: number;
  to: number;
  // [yamlFrom, yamlTo): the YAML between the fences.
  yamlFrom: number;
  yamlTo: number;
  // null when the YAML does not parse to a mapping; the frontmatter is then kept verbatim.
  properties: Properties | null;
  error: string | null;
};

const OPEN = /^---[ \t]*(\r\n|\n|\r)/;

// Finds frontmatter at the very start of the file (after an optional BOM).
export function splitFrontmatter(source: string): Frontmatter | null {
  const from = source.startsWith("\uFEFF") ? 1 : 0;
  const open = OPEN.exec(source.slice(from));
  if (!open) return null;
  const yamlFrom = from + open[0].length;
  const close = /^(?:---|\.\.\.)[ \t]*(?:\r\n|\n|\r|$)/gm;
  close.lastIndex = yamlFrom;
  let m: RegExpExecArray | null;
  while ((m = close.exec(source))) {
    // `gm` anchors `^` at any line start; only accept matches that start a line at or after yamlFrom.
    if (m.index < yamlFrom) continue;
    const yamlTo = m.index;
    const to = m.index + m[0].length;
    const { properties, error } = readYaml(source.slice(yamlFrom, yamlTo));
    return { from, to, yamlFrom, yamlTo, properties, error };
  }
  return null;
}

function readYaml(yaml: string): { properties: Properties | null; error: string | null } {
  if (yaml.trim() === "") return { properties: {}, error: null };
  try {
    const doc = parseDocument(yaml, { uniqueKeys: false });
    if (doc.errors.length) return { properties: null, error: doc.errors[0]!.message };
    const value: unknown = doc.toJS();
    if (value === null || value === undefined) return { properties: {}, error: null };
    if (typeof value !== "object" || Array.isArray(value)) {
      return { properties: null, error: "frontmatter is not a mapping" };
    }
    return { properties: value as Properties, error: null };
  } catch (e) {
    return { properties: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => deepEqual(x, bb[i]));
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(
    (k) => Object.hasOwn(b, k) && deepEqual((a as Properties)[k], (b as Properties)[k]),
  );
}

function stringifyPair(key: string, value: unknown, eol: string): string {
  const text = stringify({ [key]: value }, { lineWidth: 0 }).replace(/\n$/, "");
  return text.split("\n").join(eol);
}

export function serializeFrontmatter(properties: Properties, eol = "\n"): string {
  const lines = Object.entries(properties).map(([k, v]) => stringifyPair(k, v, eol));
  return `---${eol}${lines.map((l) => l + eol).join("")}---${eol}`;
}

// Rewrites only the top-level keys whose values changed (or were added or removed). Untouched
// keys, comments and spacing keep their bytes. `yaml` is the text between the fences.
export function editYaml(yaml: string, before: Properties, after: Properties, eol: string): string {
  const doc = parseDocument(yaml, { uniqueKeys: false });
  const contents = doc.contents;
  if (yaml.trim() !== "" && !isMap(contents)) throw new Error("frontmatter is not a mapping");
  type Item = { key: string; start: number; end: number };
  const items: Item[] = [];
  if (isMap(contents)) {
    for (const pair of contents.items) {
      const key = isScalar(pair.key) ? String(pair.key.value) : null;
      const keyRange = isScalar(pair.key) ? pair.key.range : null;
      if (key === null || !keyRange) throw new Error("unsupported frontmatter key");
      const valueNode = pair.value as { range?: [number, number, number] } | null;
      const valueEnd = valueNode?.range ? valueNode.range[1] : keyRange[1];
      // Whole lines: from the key's line start to the end of the value's last line.
      const start = yaml.lastIndexOf("\n", keyRange[0] - 1) + 1;
      let end = yaml.indexOf("\n", Math.max(valueEnd - 1, keyRange[1]));
      end = end === -1 ? yaml.length : end + 1;
      items.push({ key, start, end });
    }
  }
  let out = "";
  let cursor = 0;
  const seen = new Set<string>();
  for (const item of items) {
    out += yaml.slice(cursor, item.start);
    cursor = item.end;
    const original = yaml.slice(item.start, item.end);
    if (seen.has(item.key)) {
      out += original;
      continue;
    }
    seen.add(item.key);
    if (!Object.hasOwn(after, item.key)) continue;
    if (Object.hasOwn(before, item.key) && deepEqual(before[item.key], after[item.key])) {
      out += original;
      continue;
    }
    const lineEnd = /\r?\n$/.exec(original)?.[0] ?? "";
    out += stringifyPair(item.key, after[item.key], eol) + lineEnd;
  }
  out += yaml.slice(cursor);
  const added = Object.keys(after).filter((k) => !seen.has(k));
  if (added.length) {
    if (out !== "" && !/\n$/.test(out)) out += eol;
    for (const k of added) out += stringifyPair(k, after[k], eol) + eol;
  }
  return out;
}
