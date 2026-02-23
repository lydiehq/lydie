CREATE TABLE "collection_views" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "collection_id" text NOT NULL,
  "name" text NOT NULL,
  "type" text DEFAULT 'table' NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "deleted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_view_usages" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "document_id" text NOT NULL,
  "collection_id" text NOT NULL,
  "view_id" text NOT NULL,
  "block_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collection_views" ADD CONSTRAINT "collection_views_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "collection_views" ADD CONSTRAINT "collection_views_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "collection_view_usages" ADD CONSTRAINT "collection_view_usages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "collection_view_usages" ADD CONSTRAINT "collection_view_usages_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "collection_view_usages" ADD CONSTRAINT "collection_view_usages_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "collection_view_usages" ADD CONSTRAINT "collection_view_usages_view_id_collection_views_id_fk" FOREIGN KEY ("view_id") REFERENCES "public"."collection_views"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "collection_views_organization_id_idx" ON "collection_views" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "collection_views_collection_id_idx" ON "collection_views" USING btree ("collection_id");
--> statement-breakpoint
CREATE INDEX "collection_views_deleted_at_idx" ON "collection_views" USING btree ("deleted_at");
--> statement-breakpoint
CREATE INDEX "collection_view_usages_organization_id_idx" ON "collection_view_usages" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "collection_view_usages_collection_id_idx" ON "collection_view_usages" USING btree ("collection_id");
--> statement-breakpoint
CREATE INDEX "collection_view_usages_view_id_idx" ON "collection_view_usages" USING btree ("view_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "collection_view_usages_document_block_unique" ON "collection_view_usages" USING btree ("document_id","block_id");
