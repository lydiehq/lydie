ALTER TABLE "collection_schemas" RENAME TO "collections";
--> statement-breakpoint
ALTER TABLE "document_field_values" RENAME TO "collection_fields";
--> statement-breakpoint
ALTER TABLE "collection_fields" RENAME COLUMN "collection_schema_id" TO "collection_id";
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "collection_id" text;
--> statement-breakpoint
UPDATE "documents" AS d
SET "collection_id" = c."id"
FROM "collections" AS c
WHERE d."nearest_collection_id" IS NOT NULL
  AND c."document_id" = d."nearest_collection_id";
--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "name" text;
--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "handle" text;
--> statement-breakpoint
UPDATE "collections" AS c
SET "name" = COALESCE(NULLIF(TRIM(d."title"), ''), 'Untitled Collection')
FROM "documents" AS d
WHERE d."id" = c."document_id";
--> statement-breakpoint
UPDATE "collections"
SET "handle" = LOWER(REGEXP_REPLACE(COALESCE("name", ''), '[^a-zA-Z0-9\s-]', '', 'g'));
--> statement-breakpoint
UPDATE "collections"
SET "handle" = REGEXP_REPLACE("handle", '\s+', '-', 'g');
--> statement-breakpoint
UPDATE "collections"
SET "handle" = REGEXP_REPLACE("handle", '-+', '-', 'g');
--> statement-breakpoint
UPDATE "collections"
SET "handle" = TRIM(BOTH '-' FROM "handle");
--> statement-breakpoint
UPDATE "collections"
SET "handle" = CONCAT('collection-', SUBSTRING("id" FROM 1 FOR 6))
WHERE "handle" IS NULL OR "handle" = '';
--> statement-breakpoint
WITH ranked AS (
  SELECT
    "id",
    "organization_id",
    "handle",
    ROW_NUMBER() OVER (PARTITION BY "organization_id", "handle" ORDER BY "created_at", "id") AS rn
  FROM "collections"
)
UPDATE "collections" AS c
SET "handle" = CONCAT(c."handle", '-', ranked.rn)
FROM ranked
WHERE c."id" = ranked."id"
  AND ranked.rn > 1;
--> statement-breakpoint
ALTER TABLE "collections" ALTER COLUMN "name" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "collections" ALTER COLUMN "handle" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_nearest_collection_id_documents_id_fkey";
--> statement-breakpoint
DROP INDEX IF EXISTS "documents_path_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "documents_nearest_collection_id_idx";
--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "path";
--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "nearest_collection_id";
--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "show_children_in_sidebar";
--> statement-breakpoint
ALTER TABLE "collections" DROP COLUMN "document_id";
--> statement-breakpoint
DROP INDEX IF EXISTS "collection_schemas_organization_id_idx";
--> statement-breakpoint
CREATE INDEX "collections_organization_id_idx" ON "collections" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "collections_handle_org_idx" ON "collections" ("handle", "organization_id");
--> statement-breakpoint
ALTER INDEX IF EXISTS "document_field_values_document_id_idx" RENAME TO "collection_fields_document_id_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "document_field_values_collection_schema_id_idx" RENAME TO "collection_fields_collection_id_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "document_field_values_gin_idx" RENAME TO "collection_fields_values_gin_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "document_field_values_unique_idx" RENAME TO "collection_fields_unique_idx";
--> statement-breakpoint
CREATE INDEX "documents_collection_id_idx" ON "documents" ("collection_id");
--> statement-breakpoint
ALTER TABLE "documents"
ADD CONSTRAINT "documents_collection_id_collections_id_fkey"
FOREIGN KEY ("collection_id")
REFERENCES "collections" ("id")
ON DELETE SET NULL;
