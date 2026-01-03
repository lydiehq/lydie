import { createId } from "@lydie/core/id";
import {
  index,
  PgColumn,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  vector,
  jsonb,
  boolean,
  integer,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
  (table) => [index("sessions_user_id_idx").on(table.userId)]
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
  (table) => [index("accounts_user_id_idx").on(table.userId)]
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
  (table) => [index("verifications_identifier_idx").on(table.identifier)]
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
  ]
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
  ]
);

export const foldersTable = pgTable(
  "folders",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    name: text("name").notNull(),
    userId: text("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references(
      (): PgColumn<any> => foldersTable.id,
      {
        onDelete: "cascade",
      }
    ),
    integrationLinkId: text("integration_link_id").references(
      () => integrationLinksTable.id,
      {
        onDelete: "cascade",
      }
    ),
    deletedAt: timestamp("deleted_at"),
    ...timestamps,
  },
  (table) => [
    index("folders_organization_id_idx").on(table.organizationId),
    index("folders_integration_link_id_idx").on(table.integrationLinkId),
  ]
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
    jsonContent: jsonb("json_content").notNull(),
    yjsState: text("yjs_state"), // Y.js binary state stored as base64 for collaborative editing
    userId: text("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    folderId: text("folder_id").references(() => foldersTable.id, {
      onDelete: "set null",
    }),
    parentId: text("parent_id").references((): PgColumn<any> => documentsTable.id, {
      onDelete: "set null",
    }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    integrationLinkId: text("integration_link_id").references(
      () => integrationLinksTable.id,
      {
        onDelete: "set null",
      }
    ),
    externalId: text("external_id"), // Path/ID in external system (e.g., "docs/guide.md" in GitHub)
    customFields:
      jsonb("custom_fields").$type<Record<string, string | number>>(),
    indexStatus: text("index_status").notNull().default("outdated"),
    published: boolean("published").notNull().default(false),
    lastIndexedTitle: text("last_indexed_title"),
    lastIndexedContentHash: text("last_indexed_content_hash"),
    deletedAt: timestamp("deleted_at"),
    ...timestamps,
  },
  (table) => [
    // Unique slugs for user-created documents within organization
    uniqueIndex("documents_user_organization_id_slug_key")
      .on(table.organizationId, table.slug)
      .where(
        sql`${table.integrationLinkId} IS NULL AND ${table.deletedAt} IS NULL`
      ),
    // Unique slugs for integration documents within organization and integration link
    uniqueIndex("documents_integration_organization_link_slug_key")
      .on(table.organizationId, table.integrationLinkId, table.slug)
      .where(sql`deleted_at IS NULL`),
    index("documents_organization_id_idx").on(table.organizationId),
    index("documents_folder_id_idx").on(table.folderId),
    index("documents_parent_id_idx").on(table.parentId),
    index("documents_integration_link_id_idx").on(table.integrationLinkId),
  ]
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
    ...timestamps,
  },
  (table) => [
    index("embedding_index").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
    index("document_embeddings_document_id_idx").on(table.documentId),
  ]
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
    index("title_embedding_index").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
    index("document_title_embeddings_document_id_idx").on(table.documentId),
  ]
);

export const documentConversationsTable = pgTable(
  "document_conversations",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    title: text("title"),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    index("document_conversations_document_id_idx").on(table.documentId),
  ]
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
    ...timestamps,
  },
  (table) => [
    index("assistant_conversations_organization_id_idx").on(
      table.organizationId
    ),
  ]
);

export const documentMessagesTable = pgTable(
  "document_messages",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => documentConversationsTable.id, { onDelete: "cascade" }),
    parts: jsonb("parts").notNull(),
    role: text("role").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("document_messages_conversation_id_idx").on(table.conversationId),
  ]
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
  (table) => [
    index("assistant_messages_conversation_id_idx").on(table.conversationId),
  ]
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
  (table) => [index("api_keys_hashed_key_idx").on(table.hashedKey)]
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
    // messageId can point to either a document or assistant message, so we keep it
    // as a plain text field instead of a strict FK.
    messageId: text("message_id"),
    organizationId: text("organization_id").references(
      () => organizationsTable.id,
      { onDelete: "cascade" }
    ),
    source: text("source").notNull(), // 'document' or 'assistant'
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens").notNull(),
    completionTokens: integer("completion_tokens").notNull(),
    totalTokens: integer("total_tokens").notNull(),
    finishReason: text("finish_reason"),
    toolCalls: jsonb("tool_calls"),
    ...timestamps,
  },
  (table) => [index("llm_usage_organization_id_idx").on(table.organizationId)]
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
  persistDocumentTreeExpansion: boolean("persist_document_tree_expansion")
    .notNull()
    .default(true),
  aiPromptStyle: text("ai_prompt_style").default("default"), // 'default', 'journalistic', 'essay'
  customPrompt: text("custom_prompt"), // For PRO feature
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
  (table) => [
    index("integration_connections_organization_id_idx").on(
      table.organizationId
    ),
  ]
);

// Integration links - configurable "symlinks" to external sources
// Each link represents a specific path/source in an external system (e.g., a folder in a GitHub repo)
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
    integrationType: text("integration_type").notNull(), // Denormalized from connection for easier querying
    // Integration-specific config for this link
    // GitHub: { owner, repo, branch, path }
    // WordPress: { postType }
    // Shopify: { blogId }
    config: jsonb("config").notNull(),
    lastSyncedAt: timestamp("last_synced_at"),
    syncStatus: text("sync_status").default("idle"), // 'idle', 'pulling', 'pushing', 'error'
    ...timestamps,
  },
  (table) => [
    index("integration_links_connection_id_idx").on(table.connectionId),
    index("integration_links_organization_id_idx").on(table.organizationId),
    index("integration_links_integration_type_idx").on(table.integrationType),
  ]
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
    uniqueIndex("sync_metadata_document_connection_idx").on(
      table.documentId,
      table.connectionId
    ),
    index("sync_metadata_document_id_idx").on(table.documentId),
    index("sync_metadata_connection_id_idx").on(table.connectionId),
  ]
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
  (table) => [
    index("integration_activity_logs_connection_id_idx").on(table.connectionId),
  ]
);

export const waitlistTable = pgTable(
  "waitlist",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$default(() => createId()),
    email: text("email").notNull().unique(),
    status: text("status").notNull().default("pending"), // 'pending', 'invited', 'joined'
    invitedAt: timestamp("invited_at"),
    joinedAt: timestamp("joined_at"),
    ...timestamps,
  },
  (table) => [
    index("waitlist_email_idx").on(table.email),
    index("waitlist_status_idx").on(table.status),
  ]
);
