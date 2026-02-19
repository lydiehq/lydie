import { pgTable, text, timestamp, jsonb, vector, integer, boolean, index, uniqueIndex, foreignKey, primaryKey, unique } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const accounts = pgTable("accounts", {
	id: text().primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	scope: text(),
	password: text(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("accounts_user_id_idx").using("btree", table.userId.asc().nullsLast()),
]);

export const apiKeys = pgTable("api_keys", {
	id: text().primaryKey(),
	name: text().notNull(),
	partialKey: text("partial_key").notNull(),
	hashedKey: text("hashed_key").notNull(),
	organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" } ),
	revoked: boolean().default(false).notNull(),
	lastUsedAt: timestamp("last_used_at"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("api_keys_hashed_key_idx").using("btree", table.hashedKey.asc().nullsLast()),
]);

export const assets = pgTable("assets", {
	id: text().primaryKey(),
	key: text().notNull(),
	filename: text().notNull(),
	contentType: text("content_type").notNull(),
	size: integer(),
	organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" } ),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "set null" } ),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("assets_key_idx").using("btree", table.key.asc().nullsLast()),
	index("assets_organization_id_idx").using("btree", table.organizationId.asc().nullsLast()),
	index("assets_user_id_idx").using("btree", table.userId.asc().nullsLast()),
	unique("assets_key_key").on(table.key),]);

export const assistantAgents = pgTable("assistant_agents", {
	id: text().primaryKey(),
	name: text().notNull(),
	description: text(),
	systemPrompt: text("system_prompt").notNull(),
	isDefault: boolean("is_default").default(false).notNull(),
	organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" } ),
	userId: text("user_id").references(() => users.id, { onDelete: "cascade" } ),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("assistant_agents_organization_id_idx").using("btree", table.organizationId.asc().nullsLast()),
	index("assistant_agents_user_id_idx").using("btree", table.userId.asc().nullsLast()),
]);

export const assistantConversations = pgTable("assistant_conversations", {
	id: text().primaryKey(),
	title: text(),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" } ),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	agentId: text("agent_id").references(() => assistantAgents.id, { onDelete: "set null" } ),
}, (table) => [
	index("assistant_conversations_user_created_id_idx").using("btree", table.userId.asc().nullsLast(), table.createdAt.asc().nullsLast(), table.id.asc().nullsLast()),
]);

export const assistantMessages = pgTable("assistant_messages", {
	id: text().primaryKey(),
	conversationId: text("conversation_id").notNull().references(() => assistantConversations.id, { onDelete: "cascade" } ),
	parts: jsonb().notNull(),
	role: text().notNull(),
	metadata: jsonb(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
}, (table) => [
	index("assistant_messages_conversation_created_idx").using("btree", table.conversationId.asc().nullsLast(), table.createdAt.asc().nullsLast(), table.id.asc().nullsLast()),
]);

export const collectionSchemas = pgTable("collection_schemas", {
	id: text().primaryKey(),
	documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" } ),
	organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" } ),
	properties: jsonb().default([]).notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	uniqueIndex("collection_schemas_document_id_idx").using("btree", table.documentId.asc().nullsLast()),
	index("collection_schemas_organization_id_idx").using("btree", table.organizationId.asc().nullsLast()),
	unique("collection_schemas_document_id_key").on(table.documentId),]);

export const creditUsageLog = pgTable("credit_usage_log", {
	id: text().primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" } ),
	creditsConsumed: integer("credits_consumed").notNull(),
	actionType: text("action_type").notNull(),
	resourceId: text("resource_id"),
	stripeMeterEventId: text("stripe_meter_event_id"),
	userId: text("user_id").references(() => users.id, { onDelete: "set null" } ),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
}, (table) => [
	index("credit_usage_log_created_idx").using("btree", table.createdAt.asc().nullsLast()),
	index("credit_usage_log_org_id_idx").using("btree", table.organizationId.asc().nullsLast()),
	index("credit_usage_log_user_idx").using("btree", table.userId.asc().nullsLast()),
]);

export const documentComponents = pgTable("document_components", {
	id: text().primaryKey(),
	name: text().notNull(),
	properties: jsonb().notNull(),
	organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" } ),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
});

export const documentEmbeddings = pgTable("document_embeddings", {
	id: text().primaryKey(),
	content: text().notNull(),
	embedding: vector({ dimensions: 1536 }).notNull(),
	documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" } ),
	chunkIndex: integer("chunk_index"),
	heading: text(),
	headingLevel: integer("heading_level"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	headerBreadcrumb: text("header_breadcrumb"),
}, (table) => [
	index("document_embeddings_document_id_idx").using("btree", table.documentId.asc().nullsLast()),
	index("embedding_index").using("hnsw", table.embedding.asc().nullsLast().op("hnsw")),
]);

export const documentFieldValues = pgTable("document_field_values", {
	id: text().primaryKey(),
	documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" } ),
	collectionSchemaId: text("collection_schema_id").notNull().references(() => collectionSchemas.id, { onDelete: "cascade" } ),
	values: jsonb().default({}).notNull(),
	orphanedValues: jsonb("orphaned_values").default({}),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("document_field_values_collection_schema_id_idx").using("btree", table.collectionSchemaId.asc().nullsLast()),
	index("document_field_values_document_id_idx").using("btree", table.documentId.asc().nullsLast()),
	index("document_field_values_gin_idx").using("gin", table.values.asc().nullsLast()),
	uniqueIndex("document_field_values_unique_idx").using("btree", table.documentId.asc().nullsLast(), table.collectionSchemaId.asc().nullsLast()),
]);

export const documentLinks = pgTable("document_links", {
	id: text().primaryKey(),
	sourceDocumentId: text("source_document_id").notNull().references(() => documents.id, { onDelete: "cascade" } ),
	targetDocumentId: text("target_document_id").notNull().references(() => documents.id, { onDelete: "cascade" } ),
	lastVerifiedSlug: text("last_verified_slug"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("document_links_source_idx").using("btree", table.sourceDocumentId.asc().nullsLast()),
	index("document_links_target_idx").using("btree", table.targetDocumentId.asc().nullsLast()),
	index("document_links_target_source_idx").using("btree", table.targetDocumentId.asc().nullsLast(), table.sourceDocumentId.asc().nullsLast()),
	uniqueIndex("document_links_unique_idx").using("btree", table.sourceDocumentId.asc().nullsLast(), table.targetDocumentId.asc().nullsLast()),
]);

export const documentPublications = pgTable("document_publications", {
	id: text().primaryKey(),
	documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" } ),
	organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" } ),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
});

export const documentTitleEmbeddings = pgTable("document_title_embeddings", {
	id: text().primaryKey(),
	title: text().notNull(),
	embedding: vector({ dimensions: 1536 }).notNull(),
	documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" } ),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("document_title_embeddings_document_id_idx").using("btree", table.documentId.asc().nullsLast()),
	index("title_embedding_index").using("hnsw", table.embedding.asc().nullsLast().op("hnsw")),
]);

export const documentVersions = pgTable("document_versions", {
	id: text().primaryKey(),
	documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" } ),
	userId: text("user_id").references(() => users.id, { onDelete: "set null" } ),
	title: text().notNull(),
	yjsState: text("yjs_state").notNull(),
	versionNumber: integer("version_number").notNull(),
	changeDescription: text("change_description"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("document_versions_created_at_idx").using("btree", table.createdAt.asc().nullsLast()),
	index("document_versions_document_id_idx").using("btree", table.documentId.asc().nullsLast()),
	uniqueIndex("document_versions_document_version_idx").using("btree", table.documentId.asc().nullsLast(), table.versionNumber.asc().nullsLast()),
]);

export const documents = pgTable("documents", {
	id: text().primaryKey(),
	title: text().notNull(),
	slug: text(),
	userId: text("user_id").references(() => users.id, { onDelete: "set null" } ),
	organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" } ),
	integrationLinkId: text("integration_link_id").references(() => integrationLinks.id, { onDelete: "set null" } ),
	externalId: text("external_id"),
	published: boolean().default(false).notNull(),
	lastIndexedTitle: text("last_indexed_title"),
	lastIndexedContentHash: text("last_indexed_content_hash"),
	deletedAt: timestamp("deleted_at"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	yjsState: text("yjs_state"),
	parentId: text("parent_id"),
	isLocked: boolean("is_locked").default(false).notNull(),
	sectionHashes: jsonb("section_hashes"),
	coverImage: text("cover_image"),
	isFavorited: boolean("is_favorited").default(false).notNull(),
	path: text(),
	nearestCollectionId: text("nearest_collection_id"),
	showChildrenInSidebar: boolean("show_children_in_sidebar").default(false).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	customFields: jsonb("custom_fields"),
	fullWidth: boolean("full_width").default(false).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.nearestCollectionId],
		foreignColumns: [table.id],
		name: "documents_nearest_collection_id_documents_id_fkey"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.parentId],
		foreignColumns: [table.id],
		name: "documents_parent_id_documents_id_fkey"
	}).onDelete("set null"),
	index("documents_integration_link_id_idx").using("btree", table.integrationLinkId.asc().nullsLast()),
	index("documents_nearest_collection_id_idx").using("btree", table.nearestCollectionId.asc().nullsLast()),
	index("documents_org_created_id_not_deleted_idx").using("btree", table.organizationId.asc().nullsLast(), table.createdAt.desc().nullsFirst(), table.id.asc().nullsLast()).where(sql`(deleted_at IS NULL)`),
	index("documents_org_parent_not_deleted_created_id_idx").using("btree", table.organizationId.asc().nullsLast(), table.parentId.asc().nullsLast(), table.createdAt.asc().nullsLast(), table.id.asc().nullsLast()).where(sql`(deleted_at IS NULL)`),
	index("documents_parent_id_idx").using("btree", table.parentId.asc().nullsLast()),
	index("documents_path_idx").using("btree", table.path.asc().nullsLast()),
]);

export const feedbackSubmissions = pgTable("feedback_submissions", {
	id: text().primaryKey(),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" } ),
	type: text().notNull(),
	message: text().notNull(),
	metadata: jsonb(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("feedback_submissions_organization_id_idx").using("btree", table.organizationId.asc().nullsLast()),
	index("feedback_submissions_user_id_idx").using("btree", table.userId.asc().nullsLast()),
]);

export const integrationActivityLogs = pgTable("integration_activity_logs", {
	id: text().primaryKey(),
	connectionId: text("connection_id").notNull().references(() => integrationConnections.id, { onDelete: "cascade" } ),
	integrationType: text("integration_type").notNull(),
	activityType: text("activity_type").notNull(),
	activityStatus: text("activity_status").notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("integration_activity_logs_connection_id_idx").using("btree", table.connectionId.asc().nullsLast()),
]);

export const integrationConnections = pgTable("integration_connections", {
	id: text().primaryKey(),
	integrationType: text("integration_type").notNull(),
	organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" } ),
	config: jsonb().notNull(),
	status: text().default("active").notNull(),
	statusMessage: text("status_message"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("integration_connections_organization_created_id_idx").using("btree", table.organizationId.asc().nullsLast(), table.createdAt.asc().nullsLast(), table.id.asc().nullsLast()),
]);

export const integrationLinks = pgTable("integration_links", {
	id: text().primaryKey(),
	name: text().notNull(),
	connectionId: text("connection_id").notNull().references(() => integrationConnections.id, { onDelete: "cascade" } ),
	organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" } ),
	integrationType: text("integration_type").notNull(),
	config: jsonb().notNull(),
	lastSyncedAt: timestamp("last_synced_at"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	syncStatus: text("sync_status").default("idle"),
}, (table) => [
	index("integration_links_connection_created_id_idx").using("btree", table.connectionId.asc().nullsLast(), table.createdAt.asc().nullsLast(), table.id.asc().nullsLast()),
	index("integration_links_integration_type_idx").using("btree", table.integrationType.asc().nullsLast()),
	index("integration_links_organization_created_id_idx").using("btree", table.organizationId.asc().nullsLast(), table.createdAt.asc().nullsLast(), table.id.asc().nullsLast()),
]);

export const invitations = pgTable("invitations", {
	id: text().primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" } ),
	email: text().notNull(),
	role: text(),
	status: text().default("pending").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	inviterId: text("inviter_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("invitations_email_idx").using("btree", table.email.asc().nullsLast()),
	index("invitations_organization_id_idx").using("btree", table.organizationId.asc().nullsLast()),
]);

export const llmUsage = pgTable("llm_usage", {
	id: text().primaryKey(),
	conversationId: text("conversation_id").notNull(),
	messageId: text("message_id"),
	organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" } ),
	source: text().notNull(),
	model: text().notNull(),
	finishReason: text("finish_reason"),
	toolCalls: jsonb("tool_calls"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	creditsUsed: integer("credits_used").default(0).notNull(),
}, (table) => [
	index("llm_usage_organization_id_idx").using("btree", table.organizationId.asc().nullsLast()),
]);

export const members = pgTable("members", {
	id: text().primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" } ),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	role: text().default("member").notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("members_organization_id_idx").using("btree", table.organizationId.asc().nullsLast()),
	index("members_user_id_idx").using("btree", table.userId.asc().nullsLast()),
]);

export const organizationSettings = pgTable("organization_settings", {
	id: text().primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" } ),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	unique("organization_settings_organization_id_key").on(table.organizationId),]);

export const organizations = pgTable("organizations", {
	id: text().primaryKey(),
	name: text().notNull(),
	slug: text().notNull(),
	logo: text(),
	metadata: text(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	color: text(),
}, (table) => [
	unique("organizations_slug_key").on(table.slug),]);

export const sessions = pgTable("sessions", {
	id: text().primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: text().notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	activeOrganizationId: text("active_organization_id"),
	activeTeamId: text("active_team_id"),
	impersonatedBy: text("impersonated_by"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("sessions_user_id_idx").using("btree", table.userId.asc().nullsLast()),
	unique("sessions_token_key").on(table.token),]);

export const stripeCustomers = pgTable("stripe_customers", {
	id: text().primaryKey(),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	email: text().notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("stripe_customers_user_id_idx").using("btree", table.userId.asc().nullsLast()),
	unique("stripe_customers_user_id_key").on(table.userId),]);

export const syncMetadata = pgTable("sync_metadata", {
	id: text().primaryKey(),
	documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" } ),
	connectionId: text("connection_id").notNull().references(() => integrationConnections.id, { onDelete: "cascade" } ),
	externalId: text("external_id").notNull(),
	lastSyncedAt: timestamp("last_synced_at"),
	lastSyncedHash: text("last_synced_hash"),
	syncStatus: text("sync_status").default("pending").notNull(),
	syncError: text("sync_error"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("sync_metadata_connection_id_idx").using("btree", table.connectionId.asc().nullsLast()),
	uniqueIndex("sync_metadata_document_connection_idx").using("btree", table.documentId.asc().nullsLast(), table.connectionId.asc().nullsLast()),
	index("sync_metadata_document_id_idx").using("btree", table.documentId.asc().nullsLast()),
]);

export const templateCategories = pgTable("template_categories", {
	id: text().primaryKey(),
	name: text().notNull(),
	slug: text().notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	parentId: text("parent_id"),
}, (table) => [
	foreignKey({
		columns: [table.parentId],
		foreignColumns: [table.id],
		name: "template_categories_parent_id_template_categories_id_fkey"
	}).onDelete("cascade"),
	unique("template_categories_slug_key").on(table.slug),]);

export const templateCategoryAssignments = pgTable("template_category_assignments", {
	id: text().primaryKey(),
	templateId: text("template_id").notNull().references(() => templates.id, { onDelete: "cascade" } ),
	categoryId: text("category_id").notNull().references(() => templateCategories.id, { onDelete: "cascade" } ),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("template_category_assignments_category_id_idx").using("btree", table.categoryId.asc().nullsLast()),
	index("template_category_assignments_template_id_idx").using("btree", table.templateId.asc().nullsLast()),
	uniqueIndex("template_category_assignments_unique_idx").using("btree", table.templateId.asc().nullsLast(), table.categoryId.asc().nullsLast()),
]);

export const templateDocuments = pgTable("template_documents", {
	id: text().primaryKey(),
	templateId: text("template_id").notNull().references(() => templates.id, { onDelete: "cascade" } ),
	title: text().notNull(),
	content: text(),
	parentId: text("parent_id"),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	jsonContent: jsonb("json_content"),
}, (table) => [
	foreignKey({
		columns: [table.parentId],
		foreignColumns: [table.id],
		name: "template_documents_parent_id_template_documents_id_fkey"
	}).onDelete("set null"),
	index("template_documents_parent_id_idx").using("btree", table.parentId.asc().nullsLast()),
	index("template_documents_template_id_idx").using("btree", table.templateId.asc().nullsLast()),
]);

export const templateFaqs = pgTable("template_faqs", {
	id: text().primaryKey(),
	templateId: text("template_id").notNull().references(() => templates.id, { onDelete: "cascade" } ),
	question: text().notNull(),
	answer: text().notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("template_faqs_sort_order_idx").using("btree", table.sortOrder.asc().nullsLast()),
	index("template_faqs_template_id_idx").using("btree", table.templateId.asc().nullsLast()),
]);

export const templateInstallations = pgTable("template_installations", {
	id: text().primaryKey(),
	templateId: text("template_id").notNull().references(() => templates.id, { onDelete: "cascade" } ),
	organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" } ),
	installedByUserId: text("installed_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	rootDocumentId: text("root_document_id").notNull().references(() => documents.id, { onDelete: "cascade" } ),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
}, (table) => [
	index("template_installations_organization_id_idx").using("btree", table.organizationId.asc().nullsLast()),
	index("template_installations_template_id_idx").using("btree", table.templateId.asc().nullsLast()),
]);

export const templates = pgTable("templates", {
	id: text().primaryKey(),
	name: text().notNull(),
	slug: text().notNull(),
	description: text(),
	previewData: jsonb("preview_data"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	teaser: text(),
	detailedDescription: text("detailed_description"),
	titleEmbedding: vector("title_embedding", { dimensions: 1536 }),
	thumbnailSrc: text("thumbnail_src"),
}, (table) => [
	index("template_title_embedding_index").using("hnsw", table.titleEmbedding.asc().nullsLast().op("hnsw")),
	unique("templates_slug_key").on(table.slug),]);

export const userSettings = pgTable("user_settings", {
	id: text().primaryKey(),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	unique("user_settings_user_id_key").on(table.userId),]);

export const userWorkspaceCredits = pgTable("user_workspace_credits", {
	id: text().primaryKey(),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" } ),
	creditsIncludedMonthly: integer("credits_included_monthly").default(150).notNull(),
	creditsUsedThisPeriod: integer("credits_used_this_period").default(0).notNull(),
	creditsAvailable: integer("credits_available").default(150).notNull(),
	currentPeriodStart: timestamp("current_period_start"),
	currentPeriodEnd: timestamp("current_period_end"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	removedAt: timestamp("removed_at"),
}, (table) => [
	index("user_credits_org_id_idx").using("btree", table.organizationId.asc().nullsLast()),
	uniqueIndex("user_credits_unique_idx").using("btree", table.userId.asc().nullsLast(), table.organizationId.asc().nullsLast()),
	index("user_credits_user_id_idx").using("btree", table.userId.asc().nullsLast()),
]);

export const users = pgTable("users", {
	id: text().primaryKey(),
	name: text().notNull(),
	email: text().notNull(),
	emailVerified: boolean("email_verified").notNull(),
	image: text(),
	role: text().default("user"),
	banned: boolean().default(false),
	banReason: text("ban_reason"),
	banExpires: timestamp("ban_expires"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	unique("users_email_key").on(table.email),]);

export const verifications = pgTable("verifications", {
	id: text().primaryKey(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("verifications_identifier_idx").using("btree", table.identifier.asc().nullsLast()),
]);

export const workspaceBilling = pgTable("workspace_billing", {
	id: text().primaryKey(),
	organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" } ),
	plan: text().default("free").notNull(),
	stripeSubscriptionId: text("stripe_subscription_id"),
	stripeSubscriptionStatus: text("stripe_subscription_status"),
	billingOwnerUserId: text("billing_owner_user_id").notNull().references(() => users.id, { onDelete: "restrict" } ),
	currentPeriodStart: timestamp("current_period_start"),
	currentPeriodEnd: timestamp("current_period_end"),
	canceledAt: timestamp("canceled_at"),
	cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("workspace_billing_org_id_idx").using("btree", table.organizationId.asc().nullsLast()),
	index("workspace_billing_owner_idx").using("btree", table.billingOwnerUserId.asc().nullsLast()),
	index("workspace_billing_plan_idx").using("btree", table.plan.asc().nullsLast()),
	unique("workspace_billing_organization_id_key").on(table.organizationId),]);
