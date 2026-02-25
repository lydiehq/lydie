CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "accounts" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"partial_key" text NOT NULL,
	"hashed_key" text NOT NULL,
	"organization_id" text NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY,
	"key" text NOT NULL CONSTRAINT "assets_key_key" UNIQUE,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_agents" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"description" text,
	"system_prompt" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"organization_id" text,
	"user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_conversations" (
	"id" text PRIMARY KEY,
	"title" text,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"agent_id" text
);
--> statement-breakpoint
CREATE TABLE "assistant_messages" (
	"id" text PRIMARY KEY,
	"conversation_id" text NOT NULL,
	"parts" jsonb NOT NULL,
	"role" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_fields" (
	"id" text,
	"document_id" text NOT NULL,
	"collection_id" text NOT NULL,
	"values" jsonb DEFAULT '{}' NOT NULL,
	"orphaned_values" jsonb DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_field_values_pkey" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "collection_view_usages" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"document_id" text NOT NULL,
	"collection_id" text NOT NULL,
	"view_id" text NOT NULL,
	"block_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_views" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"collection_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'table' NOT NULL,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" text,
	"organization_id" text NOT NULL,
	"properties" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"handle" text NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "collection_schemas_pkey" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "credit_usage_log" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"credits_consumed" integer NOT NULL,
	"action_type" text NOT NULL,
	"resource_id" text,
	"stripe_meter_event_id" text,
	"user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_components" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"properties" jsonb NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_embeddings" (
	"id" text PRIMARY KEY,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"document_id" text NOT NULL,
	"chunk_index" integer,
	"heading" text,
	"heading_level" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"header_breadcrumb" text
);
--> statement-breakpoint
CREATE TABLE "document_links" (
	"id" text PRIMARY KEY,
	"source_document_id" text NOT NULL,
	"target_document_id" text NOT NULL,
	"last_verified_slug" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_publications" (
	"id" text PRIMARY KEY,
	"document_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_title_embeddings" (
	"id" text PRIMARY KEY,
	"title" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"document_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" text PRIMARY KEY,
	"document_id" text NOT NULL,
	"user_id" text,
	"title" text NOT NULL,
	"yjs_state" text NOT NULL,
	"version_number" integer NOT NULL,
	"change_description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY,
	"title" text NOT NULL,
	"slug" text,
	"user_id" text,
	"organization_id" text NOT NULL,
	"integration_link_id" text,
	"external_id" text,
	"published" boolean DEFAULT false NOT NULL,
	"last_indexed_title" text,
	"last_indexed_content_hash" text,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"yjs_state" text,
	"parent_id" text,
	"section_hashes" jsonb,
	"cover_image" text,
	"is_favorited" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"custom_fields" jsonb,
	"full_width" boolean DEFAULT false NOT NULL,
	"collection_id" text
);
--> statement-breakpoint
CREATE TABLE "feedback_submissions" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_activity_logs" (
	"id" text PRIMARY KEY,
	"connection_id" text NOT NULL,
	"integration_type" text NOT NULL,
	"activity_type" text NOT NULL,
	"activity_status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_connections" (
	"id" text PRIMARY KEY,
	"integration_type" text NOT NULL,
	"organization_id" text NOT NULL,
	"config" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"status_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_links" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"connection_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"integration_type" text NOT NULL,
	"config" jsonb NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"sync_status" text DEFAULT 'idle'
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"inviter_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_usage" (
	"id" text PRIMARY KEY,
	"conversation_id" text NOT NULL,
	"message_id" text,
	"organization_id" text,
	"source" text NOT NULL,
	"model" text NOT NULL,
	"finish_reason" text,
	"tool_calls" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"credits_used" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_settings" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL CONSTRAINT "organization_settings_organization_id_key" UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"slug" text NOT NULL CONSTRAINT "organizations_slug_key" UNIQUE,
	"logo" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"color" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL CONSTRAINT "sessions_token_key" UNIQUE,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	"active_team_id" text,
	"impersonated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_customers" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL CONSTRAINT "stripe_customers_user_id_key" UNIQUE,
	"email" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_metadata" (
	"id" text PRIMARY KEY,
	"document_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"external_id" text NOT NULL,
	"last_synced_at" timestamp,
	"last_synced_hash" text,
	"sync_status" text DEFAULT 'pending' NOT NULL,
	"sync_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_categories" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"slug" text NOT NULL CONSTRAINT "template_categories_slug_key" UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"parent_id" text
);
--> statement-breakpoint
CREATE TABLE "template_category_assignments" (
	"id" text PRIMARY KEY,
	"template_id" text NOT NULL,
	"category_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_documents" (
	"id" text PRIMARY KEY,
	"template_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"parent_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"json_content" jsonb
);
--> statement-breakpoint
CREATE TABLE "template_faqs" (
	"id" text PRIMARY KEY,
	"template_id" text NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_installations" (
	"id" text PRIMARY KEY,
	"template_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"installed_by_user_id" text NOT NULL,
	"root_document_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"slug" text NOT NULL CONSTRAINT "templates_slug_key" UNIQUE,
	"description" text,
	"preview_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"teaser" text,
	"detailed_description" text,
	"title_embedding" vector(1536),
	"thumbnail_src" text
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL CONSTRAINT "user_settings_user_id_key" UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_workspace_credits" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"credits_included_monthly" integer DEFAULT 150 NOT NULL,
	"credits_used_this_period" integer DEFAULT 0 NOT NULL,
	"credits_available" integer DEFAULT 150 NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"removed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL CONSTRAINT "users_email_key" UNIQUE,
	"email_verified" boolean NOT NULL,
	"image" text,
	"role" text DEFAULT 'user',
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_billing" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL CONSTRAINT "workspace_billing_organization_id_key" UNIQUE,
	"plan" text DEFAULT 'free' NOT NULL,
	"stripe_subscription_id" text,
	"stripe_subscription_status" text,
	"billing_owner_user_id" text NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"canceled_at" timestamp,
	"cancel_at_period_end" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" ("user_id");--> statement-breakpoint
CREATE INDEX "api_keys_hashed_key_idx" ON "api_keys" ("hashed_key");--> statement-breakpoint
CREATE INDEX "assets_key_idx" ON "assets" ("key");--> statement-breakpoint
CREATE INDEX "assets_organization_id_idx" ON "assets" ("organization_id");--> statement-breakpoint
CREATE INDEX "assets_user_id_idx" ON "assets" ("user_id");--> statement-breakpoint
CREATE INDEX "assistant_agents_organization_id_idx" ON "assistant_agents" ("organization_id");--> statement-breakpoint
CREATE INDEX "assistant_agents_user_id_idx" ON "assistant_agents" ("user_id");--> statement-breakpoint
CREATE INDEX "assistant_conversations_user_created_id_idx" ON "assistant_conversations" ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "assistant_messages_conversation_created_idx" ON "assistant_messages" ("conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "collection_fields_collection_id_idx" ON "collection_fields" ("collection_id");--> statement-breakpoint
CREATE INDEX "collection_fields_document_id_idx" ON "collection_fields" ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_fields_unique_idx" ON "collection_fields" ("document_id","collection_id");--> statement-breakpoint
CREATE INDEX "collection_fields_values_gin_idx" ON "collection_fields" USING gin ("values");--> statement-breakpoint
CREATE INDEX "collection_view_usages_collection_id_idx" ON "collection_view_usages" ("collection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_view_usages_document_block_unique" ON "collection_view_usages" ("document_id","block_id");--> statement-breakpoint
CREATE INDEX "collection_view_usages_organization_id_idx" ON "collection_view_usages" ("organization_id");--> statement-breakpoint
CREATE INDEX "collection_view_usages_view_id_idx" ON "collection_view_usages" ("view_id");--> statement-breakpoint
CREATE INDEX "collection_views_collection_id_idx" ON "collection_views" ("collection_id");--> statement-breakpoint
CREATE INDEX "collection_views_deleted_at_idx" ON "collection_views" ("deleted_at");--> statement-breakpoint
CREATE INDEX "collection_views_organization_id_idx" ON "collection_views" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_handle_org_idx" ON "collections" ("handle","organization_id");--> statement-breakpoint
CREATE INDEX "collections_organization_id_idx" ON "collections" ("organization_id");--> statement-breakpoint
CREATE INDEX "credit_usage_log_created_idx" ON "credit_usage_log" ("created_at");--> statement-breakpoint
CREATE INDEX "credit_usage_log_org_id_idx" ON "credit_usage_log" ("organization_id");--> statement-breakpoint
CREATE INDEX "credit_usage_log_user_idx" ON "credit_usage_log" ("user_id");--> statement-breakpoint
CREATE INDEX "document_embeddings_document_id_idx" ON "document_embeddings" ("document_id");--> statement-breakpoint
CREATE INDEX "embedding_index" ON "document_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "document_links_source_idx" ON "document_links" ("source_document_id");--> statement-breakpoint
CREATE INDEX "document_links_target_idx" ON "document_links" ("target_document_id");--> statement-breakpoint
CREATE INDEX "document_links_target_source_idx" ON "document_links" ("target_document_id","source_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_links_unique_idx" ON "document_links" ("source_document_id","target_document_id");--> statement-breakpoint
CREATE INDEX "document_title_embeddings_document_id_idx" ON "document_title_embeddings" ("document_id");--> statement-breakpoint
CREATE INDEX "title_embedding_index" ON "document_title_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "document_versions_created_at_idx" ON "document_versions" ("created_at");--> statement-breakpoint
CREATE INDEX "document_versions_document_id_idx" ON "document_versions" ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_document_version_idx" ON "document_versions" ("document_id","version_number");--> statement-breakpoint
CREATE INDEX "documents_collection_id_idx" ON "documents" ("collection_id");--> statement-breakpoint
CREATE INDEX "documents_integration_link_id_idx" ON "documents" ("integration_link_id");--> statement-breakpoint
CREATE INDEX "documents_org_created_id_not_deleted_idx" ON "documents" ("organization_id","created_at" DESC,"id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "documents_org_parent_not_deleted_created_id_idx" ON "documents" ("organization_id","parent_id","created_at","id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "documents_parent_id_idx" ON "documents" ("parent_id");--> statement-breakpoint
CREATE INDEX "feedback_submissions_organization_id_idx" ON "feedback_submissions" ("organization_id");--> statement-breakpoint
CREATE INDEX "feedback_submissions_user_id_idx" ON "feedback_submissions" ("user_id");--> statement-breakpoint
CREATE INDEX "integration_activity_logs_connection_id_idx" ON "integration_activity_logs" ("connection_id");--> statement-breakpoint
CREATE INDEX "integration_connections_organization_created_id_idx" ON "integration_connections" ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX "integration_links_connection_created_id_idx" ON "integration_links" ("connection_id","created_at","id");--> statement-breakpoint
CREATE INDEX "integration_links_integration_type_idx" ON "integration_links" ("integration_type");--> statement-breakpoint
CREATE INDEX "integration_links_organization_created_id_idx" ON "integration_links" ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" ("email");--> statement-breakpoint
CREATE INDEX "invitations_organization_id_idx" ON "invitations" ("organization_id");--> statement-breakpoint
CREATE INDEX "llm_usage_organization_id_idx" ON "llm_usage" ("organization_id");--> statement-breakpoint
CREATE INDEX "members_organization_id_idx" ON "members" ("organization_id");--> statement-breakpoint
CREATE INDEX "members_user_id_idx" ON "members" ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "stripe_customers_user_id_idx" ON "stripe_customers" ("user_id");--> statement-breakpoint
CREATE INDEX "sync_metadata_connection_id_idx" ON "sync_metadata" ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_metadata_document_connection_idx" ON "sync_metadata" ("document_id","connection_id");--> statement-breakpoint
CREATE INDEX "sync_metadata_document_id_idx" ON "sync_metadata" ("document_id");--> statement-breakpoint
CREATE INDEX "template_category_assignments_category_id_idx" ON "template_category_assignments" ("category_id");--> statement-breakpoint
CREATE INDEX "template_category_assignments_template_id_idx" ON "template_category_assignments" ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "template_category_assignments_unique_idx" ON "template_category_assignments" ("template_id","category_id");--> statement-breakpoint
CREATE INDEX "template_documents_parent_id_idx" ON "template_documents" ("parent_id");--> statement-breakpoint
CREATE INDEX "template_documents_template_id_idx" ON "template_documents" ("template_id");--> statement-breakpoint
CREATE INDEX "template_faqs_sort_order_idx" ON "template_faqs" ("sort_order");--> statement-breakpoint
CREATE INDEX "template_faqs_template_id_idx" ON "template_faqs" ("template_id");--> statement-breakpoint
CREATE INDEX "template_installations_organization_id_idx" ON "template_installations" ("organization_id");--> statement-breakpoint
CREATE INDEX "template_installations_template_id_idx" ON "template_installations" ("template_id");--> statement-breakpoint
CREATE INDEX "template_title_embedding_index" ON "templates" USING hnsw ("title_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "user_credits_org_id_idx" ON "user_workspace_credits" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_credits_unique_idx" ON "user_workspace_credits" ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "user_credits_user_id_idx" ON "user_workspace_credits" ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" ("identifier");--> statement-breakpoint
CREATE INDEX "workspace_billing_org_id_idx" ON "workspace_billing" ("organization_id");--> statement-breakpoint
CREATE INDEX "workspace_billing_owner_idx" ON "workspace_billing" ("billing_owner_user_id");--> statement-breakpoint
CREATE INDEX "workspace_billing_plan_idx" ON "workspace_billing" ("plan");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_agent_id_assistant_agents_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "assistant_agents"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_KhH0Ln9Lezgn_fkey" FOREIGN KEY ("conversation_id") REFERENCES "assistant_conversations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "document_components" ADD CONSTRAINT "document_components_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "document_embeddings" ADD CONSTRAINT "document_embeddings_document_id_documents_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "document_publications" ADD CONSTRAINT "document_publications_document_id_documents_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "document_publications" ADD CONSTRAINT "document_publications_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "document_title_embeddings" ADD CONSTRAINT "document_title_embeddings_document_id_documents_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_collection_id_collections_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_integration_link_id_integration_links_id_fkey" FOREIGN KEY ("integration_link_id") REFERENCES "integration_links"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_parent_id_documents_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "documents"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "integration_activity_logs" ADD CONSTRAINT "integration_activity_logs_snDbZK6owFfE_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_links" ADD CONSTRAINT "integration_links_connection_id_integration_connections_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_links" ADD CONSTRAINT "integration_links_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_users_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sync_metadata" ADD CONSTRAINT "sync_metadata_connection_id_integration_connections_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sync_metadata" ADD CONSTRAINT "sync_metadata_document_id_documents_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "feedback_submissions" ADD CONSTRAINT "feedback_submissions_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feedback_submissions" ADD CONSTRAINT "feedback_submissions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assistant_agents" ADD CONSTRAINT "assistant_agents_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assistant_agents" ADD CONSTRAINT "assistant_agents_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "template_documents" ADD CONSTRAINT "template_documents_parent_id_template_documents_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "template_documents"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "template_documents" ADD CONSTRAINT "template_documents_template_id_templates_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "template_installations" ADD CONSTRAINT "template_installations_installed_by_user_id_users_id_fkey" FOREIGN KEY ("installed_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "template_installations" ADD CONSTRAINT "template_installations_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "template_installations" ADD CONSTRAINT "template_installations_root_document_id_documents_id_fkey" FOREIGN KEY ("root_document_id") REFERENCES "documents"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "template_installations" ADD CONSTRAINT "template_installations_template_id_templates_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "template_categories" ADD CONSTRAINT "template_categories_parent_id_template_categories_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "template_categories"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "template_category_assignments" ADD CONSTRAINT "template_category_assignments_434bcYuJEpgj_fkey" FOREIGN KEY ("category_id") REFERENCES "template_categories"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "template_category_assignments" ADD CONSTRAINT "template_category_assignments_template_id_templates_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "template_faqs" ADD CONSTRAINT "template_faqs_template_id_templates_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credit_usage_log" ADD CONSTRAINT "credit_usage_log_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credit_usage_log" ADD CONSTRAINT "credit_usage_log_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "stripe_customers" ADD CONSTRAINT "stripe_customers_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_workspace_credits" ADD CONSTRAINT "user_workspace_credits_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_workspace_credits" ADD CONSTRAINT "user_workspace_credits_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workspace_billing" ADD CONSTRAINT "workspace_billing_billing_owner_user_id_users_id_fkey" FOREIGN KEY ("billing_owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "workspace_billing" ADD CONSTRAINT "workspace_billing_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_source_document_id_documents_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "documents"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_target_document_id_documents_id_fkey" FOREIGN KEY ("target_document_id") REFERENCES "documents"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collection_schemas_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "collection_fields" ADD CONSTRAINT "document_field_values_document_id_documents_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "collection_fields" ADD CONSTRAINT "document_field_values_MMLQeyW33JE8_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "collection_views" ADD CONSTRAINT "collection_views_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "collection_views" ADD CONSTRAINT "collection_views_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "collection_view_usages" ADD CONSTRAINT "collection_view_usages_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "collection_view_usages" ADD CONSTRAINT "collection_view_usages_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "collection_view_usages" ADD CONSTRAINT "collection_view_usages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "collection_view_usages" ADD CONSTRAINT "collection_view_usages_view_id_collection_views_id_fk" FOREIGN KEY ("view_id") REFERENCES "collection_views"("id") ON DELETE CASCADE;