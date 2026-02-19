import { randomBytes } from "node:crypto";

import { sql } from "drizzle-orm";

import { db } from "..";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function randomChars(length: number): string {
  return randomBytes(length).toString("hex").slice(0, length);
}

async function main() {
  console.info("Starting separate collections migration...");

  const schemas = await db.execute<{
    id: string;
    document_id: string;
    organization_id: string;
    properties: unknown;
    created_at: Date;
    updated_at: Date;
    title: string | null;
  }>(sql`
    SELECT cs.id, cs.document_id, cs.organization_id, cs.properties, cs.created_at, cs.updated_at, d.title
    FROM collection_schemas cs
    INNER JOIN documents d ON d.id = cs.document_id
  `);

  for (const schema of schemas) {
    const base = slugify(schema.title || "") || `collection-${randomChars(4)}`;
    let handle = base;
    let counter = 2;

    while (true) {
      const existing = await db.execute(sql`
        SELECT id FROM collections
        WHERE organization_id = ${schema.organization_id}
          AND handle = ${handle}
        LIMIT 1
      `);
      if (existing.length === 0) break;
      handle = `${base}-${counter}`;
      counter += 1;
    }

    await db.execute(sql`
      INSERT INTO collections (id, name, handle, properties, show_entries_in_sidebar, organization_id, created_at, updated_at)
      VALUES (
        ${schema.id},
        ${schema.title || "Untitled Collection"},
        ${handle},
        ${schema.properties}::jsonb,
        false,
        ${schema.organization_id},
        ${schema.created_at},
        ${schema.updated_at}
      )
      ON CONFLICT (id) DO NOTHING
    `);
  }

  await db.execute(sql`
    UPDATE documents
    SET collection_id = nearest_collection_id
    WHERE nearest_collection_id IS NOT NULL
      AND collection_id IS NULL
  `);

  await db.execute(sql`
    ALTER TABLE document_field_values
    RENAME TO collection_fields
  `).catch(() => undefined);

  await db.execute(sql`
    ALTER TABLE collection_fields
    RENAME COLUMN collection_schema_id TO collection_id
  `).catch(() => undefined);

  await db.execute(sql`
    ALTER TABLE documents
    DROP COLUMN IF EXISTS path,
    DROP COLUMN IF EXISTS nearest_collection_id,
    DROP COLUMN IF EXISTS show_children_in_sidebar
  `);

  await db.execute(sql`DROP TABLE IF EXISTS collection_schemas`);

  console.info("Collections migration complete.");
}

main().catch((error) => {
  console.error("Collections migration failed:", error);
  process.exit(1);
});
