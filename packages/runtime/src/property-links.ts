// Links in properties (frontmatter): `[[Note]]` / `![[Note]]` inside string values, and relation
// values (document ids) of database rows. They are link rows like body links, tagged with the
// property they come from, so backlinks include them and a body save keeps them (and vice versa).
import { isUuid } from "@lydie/contract";
import type { Document, Properties } from "@lydie/contract";

import type { DbRead, LinkRow } from "./ports.ts";
import type { ExtractedLink } from "./text.ts";

export type PropertyLink = ExtractedLink & { property: string };

const WIKILINK = /(!?)\[\[([^[\]\n]+)\]\]/g;

export function propertyLinks(
  properties: Properties,
  relationKeys: ReadonlySet<string> = new Set(),
): PropertyLink[] {
  const out: PropertyLink[] = [];
  const seen = new Set<string>();
  const add = (link: PropertyLink) => {
    const key = [link.property, link.kind, link.target, link.heading, link.blockId].join("\u0000");
    if (seen.has(key)) return;
    seen.add(key);
    out.push(link);
  };
  for (const [property, value] of Object.entries(properties)) {
    const items = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    for (const item of items) {
      if (relationKeys.has(property) && isUuid(item)) {
        add({ ...bare(item), kind: "link", syntax: "wikilink", property });
        continue;
      }
      for (const m of item.matchAll(WIKILINK)) {
        const inner = m[2]!.split("|")[0]!;
        const hash = inner.indexOf("#");
        const target = (hash === -1 ? inner : inner.slice(0, hash)).trim();
        const part = hash === -1 ? null : inner.slice(hash + 1).trim();
        if (!target) continue;
        add({
          kind: m[1] ? "embed" : "link",
          syntax: "wikilink",
          target,
          heading: part && !part.startsWith("^") ? part.split("#").pop()!.trim() || null : null,
          blockId: part?.startsWith("^") ? part.slice(1) || null : null,
          sourceBlockId: null,
          property,
        });
      }
    }
  }
  return out;
}

function bare(target: string) {
  return { target, heading: null, blockId: null, sourceBlockId: null };
}

// Frontmatter keys of a document's relation properties (when it is a row of a live database).
export async function relationKeysOf(tx: DbRead, doc: Document): Promise<Set<string>> {
  if (!doc.parentId || !tx.databases) return new Set();
  const database = await tx.databases.get(doc.parentId);
  if (!database || database.deletedAt) return new Set();
  const props = await tx.databases.properties(doc.parentId);
  return new Set(props.filter((p) => p.type === "relation").map((p) => p.key));
}

// Body links of a document as stored (property links are rebuilt from its properties).
export function bodyLinkRows(rows: readonly LinkRow[]): LinkRow[] {
  return rows.filter((r) => !r.sourceProperty);
}
