import { createId } from "@lydie/core/id";
import { sql } from "drizzle-orm";
import {
  PgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
};

export const usersTable = pgTable("users", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$default(() => createId()),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  role: text("role").default("user"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  ...timestamps,
});

export const sessionsTable = pgTable(
  "sessions",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
    activeTeamId: text("active_team_id"),
    impersonatedBy: text("impersonated_by"),
    ...timestamps,
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const accountsTable = pgTable(
  "accounts",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
);

export const verificationsTable = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    ...timestamps,
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

export const organizationsTable = pgTable("organizations", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$default(() => createId()),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  logo: text("logo"),
  metadata: text("metadata"),
  color: text("color"),
  // Subscription info synced from Polar via webhooks
  subscriptionStatus: text("subscription_status").default("free"), // 'free', 'active', 'canceled', 'past_due'
  subscriptionPlan: text("subscription_plan").default("free"), // 'free', 'pro'
  polarSubscriptionId: text("polar_subscription_id"),
  ...timestamps,
});

export const membersTable = pgTable(
  "members",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    ...timestamps,
  },
  (table) => [
    index("members_user_id_idx").on(table.userId),
    index("members_organization_id_idx").on(table.organizationId),
  ],
);

export const invitationsTable = pgTable(
  "invitations",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at").notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    index("invitations_email_idx").on(table.email),
    index("invitations_organization_id_idx").on(table.organizationId),
  ],
);

export const documentsTable = pgTable(
  "documents",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    yjsState: text("yjs_state"), // Y.js binary state stored as base64 for collaborative editing
    userId: text("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    parentId: text("parent_id").references((): PgColumn<any> => documentsTable.id, {
      onDelete: "set null",
    }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    integrationLinkId: text("integration_link_id").references(() => integrationLinksTable.id, {
      onDelete: "set null",
    }),
    externalId: text("external_id"),
    customFields: jsonb("custom_fields").$type<Record<string, string | number>>(),
    coverImage: text("cover_image"),
    published: boolean("published").notNull().default(false),
    lastIndexedTitle: text("last_indexed_title"),
    lastIndexedContentHash: text("last_indexed_content_hash"),
    sectionHashes: jsonb("section_hashes").$type<Record<string, string>>(), // Track which sections have changed for incremental updates
    deletedAt: timestamp("deleted_at"),
    isLocked: boolean("is_locked").notNull().default(false),
    isFavorited: boolean("is_favorited").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("documents_user_organization_id_slug_key")
      .on(table.organizationId, table.slug)
      .where(sql`${table.integrationLinkId} IS NULL AND ${table.deletedAt} IS NULL`),
    uniqueIndex("documents_integration_organization_link_slug_key")
      .on(table.organizationId, table.integrationLinkId, table.slug)
      .where(sql`deleted_at IS NULL`),
    index("documents_organization_id_idx").on(table.organizationId),
    index("documents_parent_id_idx").on(table.parentId),
    index("documents_integration_link_id_idx").on(table.integrationLinkId),
  ],
);

export const documentPublicationsTable = pgTable("document_publications", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$default(() => createId()),
  documentId: text("document_id")
    .notNull()
    .references(() => documentsTable.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  ...timestamps,
});

export const documentEmbeddingsTable = pgTable(
  "document_embeddings",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    documentId: text("document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index"),
    heading: text("heading"),
    headingLevel: integer("heading_level"),
    headerBreadcrumb: text("header_breadcrumb"), // Full header hierarchy: "## Section > ### Subsection"
    ...timestamps,
  },
  (table) => [
    index("embedding_index").using("hnsw", table.embedding.op("vector_cosine_ops")),
    index("document_embeddings_document_id_idx").on(table.documentId),
  ],
);

export const documentTitleEmbeddingsTable = pgTable(
  "document_title_embeddings",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    title: text("title").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    documentId: text("document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    index("title_embedding_index").using("hnsw", table.embedding.op("vector_cosine_ops")),
    index("document_title_embeddings_document_id_idx").on(table.documentId),
  ],
);

export const assistantAgentsTable = pgTable(
  "assistant_agents",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    name: text("name").notNull(),
    description: text("description"),
    systemPrompt: text("system_prompt").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    organizationId: text("organization_id").references(() => organizationsTable.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id").references(() => usersTable.id, {
      onDelete: "cascade",
    }),
    ...timestamps,
  },
  (table) => [
    index("assistant_agents_organization_id_idx").on(table.organizationId),
    index("assistant_agents_user_id_idx").on(table.userId),
  ],
);

export const assistantConversationsTable = pgTable(
  "assistant_conversations",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    title: text("title"),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    agentId: text("agent_id").references(() => assistantAgentsTable.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [index("assistant_conversations_organization_id_idx").on(table.organizationId)],
);

export const assistantMessagesTable = pgTable(
  "assistant_messages",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => assistantConversationsTable.id, {
        onDelete: "cascade",
      }),
    parts: jsonb("parts").notNull(),
    role: text("role").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("assistant_messages_conversation_id_idx").on(table.conversationId)],
);

export const apiKeysTable = pgTable(
  "api_keys",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    name: text("name").notNull(),
    partialKey: text("partial_key").notNull(),
    hashedKey: text("hashed_key").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    revoked: boolean("revoked").notNull().default(false),
    lastUsedAt: timestamp("last_used_at"),
    ...timestamps,
  },
  (table) => [index("api_keys_hashed_key_idx").on(table.hashedKey)],
);

export const documentComponentsTable = pgTable("document_components", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$default(() => createId()),
  name: text("name").notNull(),
  properties: jsonb("properties").notNull(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  ...timestamps,
});

// LLM usage tracking (unified for both document and assistant chat)
export const llmUsageTable = pgTable(
  "llm_usage",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    conversationId: text("conversation_id").notNull(),
    messageId: text("message_id"),
    organizationId: text("organization_id").references(() => organizationsTable.id, {
      onDelete: "cascade",
    }),
    source: text("source").notNull(), // 'document' or 'assistant'
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens").notNull(),
    completionTokens: integer("completion_tokens").notNull(),
    totalTokens: integer("total_tokens").notNull(),
    finishReason: text("finish_reason"),
    toolCalls: jsonb("tool_calls"),
    ...timestamps,
  },
  (table) => [index("llm_usage_organization_id_idx").on(table.organizationId)],
);

export const userSettingsTable = pgTable("user_settings", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$default(() => createId()),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  persistDocumentTreeExpansion: boolean("persist_document_tree_expansion").notNull().default(true),
  ...timestamps,
});

export const organizationSettingsTable = pgTable("organization_settings", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$default(() => createId()),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  ...timestamps,
});

export const integrationConnectionsTable = pgTable(
  "integration_connections",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    integrationType: text("integration_type").notNull(), // 'github', 'shopify', 'wordpress', etc.
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    config: jsonb("config").notNull(), // Platform-specific config (access tokens, etc.)
    status: text("status").notNull().default("active"), // 'active', 'revoked', 'error', 'suspended'
    statusMessage: text("status_message"), // Optional error/status details
    ...timestamps,
  },
  (table) => [index("integration_connections_organization_id_idx").on(table.organizationId)],
);

export const integrationLinksTable = pgTable(
  "integration_links",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    name: text("name").notNull(), // Display name (e.g., "Web Docs", "API Reference")
    connectionId: text("connection_id")
      .notNull()
      .references(() => integrationConnectionsTable.id, {
        onDelete: "cascade",
      }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    integrationType: text("integration_type").notNull(),
    config: jsonb("config").notNull(),
    lastSyncedAt: timestamp("last_synced_at"),
    syncStatus: text("sync_status").default("idle"), // 'idle', 'pulling', 'pushing', 'error'
    ...timestamps,
  },
  (table) => [
    index("integration_links_connection_id_idx").on(table.connectionId),
    index("integration_links_organization_id_idx").on(table.organizationId),
    index("integration_links_integration_type_idx").on(table.integrationType),
  ],
);

export const syncMetadataTable = pgTable(
  "sync_metadata",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    documentId: text("document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => integrationConnectionsTable.id, {
        onDelete: "cascade",
      }),
    externalId: text("external_id").notNull(), // ID/path in external system
    lastSyncedAt: timestamp("last_synced_at"),
    lastSyncedHash: text("last_synced_hash"), // Content hash for change detection
    syncStatus: text("sync_status").notNull().default("pending"), // 'synced', 'pending', 'conflict', 'error'
    syncError: text("sync_error"), // Error message if sync failed
    ...timestamps,
  },
  (table) => [
    uniqueIndex("sync_metadata_document_connection_idx").on(table.documentId, table.connectionId),
    index("sync_metadata_document_id_idx").on(table.documentId),
    index("sync_metadata_connection_id_idx").on(table.connectionId),
  ],
);

export const integrationActivityLogsTable = pgTable(
  "integration_activity_logs",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    connectionId: text("connection_id")
      .notNull()
      .references(() => integrationConnectionsTable.id, {
        onDelete: "cascade",
      }),
    integrationType: text("integration_type").notNull(), // Denormalized from connection for easier querying with Zero
    activityType: text("activity_type").notNull(), // 'push', 'pull', 'sync'
    activityStatus: text("activity_status").notNull(), // 'success', 'failure', 'conflict', 'error'
    ...timestamps,
  },
  (table) => [index("integration_activity_logs_connection_id_idx").on(table.connectionId)],
);

export const assetsTable = pgTable(
  "assets",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    key: text("key").notNull().unique(), // S3 key: organizationId/userId/uniqueId.extension
    filename: text("filename").notNull(), // Original filename
    contentType: text("content_type").notNull(),
    size: integer("size"), // File size in bytes
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    index("assets_organization_id_idx").on(table.organizationId),
    index("assets_user_id_idx").on(table.userId),
    index("assets_key_idx").on(table.key),
  ],
);

export const feedbackSubmissionsTable = pgTable(
  "feedback_submissions",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // 'feedback' or 'help'
    message: text("message").notNull(),
    metadata: jsonb("metadata"), // Optional context like current page, browser info, etc.
    ...timestamps,
  },
  (table) => [
    index("feedback_submissions_user_id_idx").on(table.userId),
    index("feedback_submissions_organization_id_idx").on(table.organizationId),
  ],
);

export const templatesTable = pgTable(
  "templates",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    teaser: text("teaser"),
    detailedDescription: text("detailed_description"),
    previewData: jsonb("preview_data"), // Serialized document tree for preview
    titleEmbedding: vector("title_embedding", { dimensions: 1536 }),
    ...timestamps,
  },
  (table) => [
    index("template_title_embedding_index").using(
      "hnsw",
      table.titleEmbedding.op("vector_cosine_ops"),
    ),
  ],
);

export const templateDocumentsTable = pgTable(
  "template_documents",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    templateId: text("template_id")
      .notNull()
      .references(() => templatesTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content"), // Serialized YJS state
    jsonContent: jsonb("json_content"), // Pre-processed TipTap JSON for fast marketing site access
    parentId: text("parent_id").references((): PgColumn<any> => templateDocumentsTable.id, {
      onDelete: "set null",
    }),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("template_documents_template_id_idx").on(table.templateId),
    index("template_documents_parent_id_idx").on(table.parentId),
  ],
);

export const templateInstallationsTable = pgTable(
  "template_installations",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    templateId: text("template_id")
      .notNull()
      .references(() => templatesTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    installedByUserId: text("installed_by_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    rootDocumentId: text("root_document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("template_installations_template_id_idx").on(table.templateId),
    index("template_installations_organization_id_idx").on(table.organizationId),
  ],
);

export const templateCategoriesTable = pgTable("template_categories", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$default(() => createId()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ...timestamps,
});

export const templateCategoryAssignmentsTable = pgTable(
  "template_category_assignments",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    templateId: text("template_id")
      .notNull()
      .references(() => templatesTable.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => templateCategoriesTable.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    index("template_category_assignments_template_id_idx").on(table.templateId),
    index("template_category_assignments_category_id_idx").on(table.categoryId),
    uniqueIndex("template_category_assignments_unique_idx").on(table.templateId, table.categoryId),
  ],
);
