import {
  boolean,
  createBuilder,
  createSchema,
  json,
  number,
  relationships,
  string,
  table,
} from "@rocicorp/zero";

const timestamps = {
  created_at: number(),
  updated_at: number(),
};

const users = table("users")
  .columns({
    id: string(),
    name: string(),
    email: string(),
    image: string().optional(),
    role: string(),
    ...timestamps,
  })
  .primaryKey("id");

const organizations = table("organizations")
  .columns({
    id: string(),
    name: string(),
    slug: string(),
    logo: string().optional(),
    metadata: string().optional(),
    color: string().optional(),
    ...timestamps,
  })
  .primaryKey("id");

const members = table("members")
  .columns({
    id: string(),
    organization_id: string(),
    user_id: string(),
    role: string(),
    ...timestamps,
  })
  .primaryKey("id");

const invitations = table("invitations")
  .columns({
    id: string(),
    organization_id: string(),
    email: string(),
    role: string().optional(),
    status: string(),
    expires_at: number(),
    inviter_id: string(),
    ...timestamps,
  })
  .primaryKey("id");

/**
 * Documents Table
 * The core content primitive
 */
const documents = table("documents")
  .columns({
    id: string(),
    title: string(),
    slug: string().optional(),
    sort_order: number(),
    yjs_state: string().optional(),
    // Note: body field removed - using yjsState exclusively for content storage
    user_id: string(),
    parent_id: string().optional(),
    // Materialized path: slash-separated ancestor ids including own id
    path: string(),
    // Denormalized: id of the nearest ancestor Collection
    nearest_collection_id: string().optional(),
    organization_id: string(),
    integration_link_id: string().optional(),
    external_id: string().optional(),
    show_children_in_sidebar: boolean(),
    cover_image: string().optional(),
    full_width: boolean(),
    published: boolean(),
    deleted_at: number().optional(),
    is_locked: boolean(),
    is_favorited: boolean(),
    ...timestamps,
  })
  .primaryKey("id");

/**
 * Collection Schemas Table
 * A Collection is a Document with a row in this table
 */
const collectionSchemas = table("collection_schemas")
  .columns({
    id: string(),
    document_id: string(),
    organization_id: string(),
    properties: json(), // Array of property definitions
    ...timestamps,
  })
  .primaryKey("id");

/**
 * Document Field Values Table
 * Stores field values for Documents that belong to Collections
 */
const documentFieldValues = table("document_field_values")
  .columns({
    id: string(),
    document_id: string(),
    collection_schema_id: string(),
    values: json(), // Field values as key-value map
    orphaned_values: json().optional(), // Preserved values from previous Collection
    ...timestamps,
  })
  .primaryKey("id");

const documentVersions = table("document_versions")
  .columns({
    id: string(),
    document_id: string(),
    user_id: string().optional(),
    title: string(),
    yjs_state: string(),
    version_number: number(),
    change_description: string().optional(),
    ...timestamps,
  })
  .primaryKey("id");

const documentLinks = table("document_links")
  .columns({
    id: string(),
    source_document_id: string(),
    target_document_id: string(),
    last_verified_slug: string().optional(),
    ...timestamps,
  })
  .primaryKey("id");

const documentPublications = table("document_publications")
  .columns({
    id: string(),
    document_id: string(),
    organization_id: string(),
    ...timestamps,
  })
  .primaryKey("id");

const documentPublicationsRelations = relationships(documentPublications, ({ one }) => ({
  document: one({
    sourceField: ["document_id"],
    destField: ["id"],
    destSchema: documents,
  }),
  organization: one({
    sourceField: ["organization_id"],
    destField: ["id"],
    destSchema: organizations,
  }),
}));

const assistantAgents = table("assistant_agents")
  .columns({
    id: string(),
    name: string(),
    description: string().optional(),
    system_prompt: string(),
    is_default: boolean(),
    organization_id: string().optional(),
    user_id: string().optional(),
    ...timestamps,
  })
  .primaryKey("id");

const assistantConversations = table("assistant_conversations")
  .columns({
    id: string(),
    title: string().optional(),
    user_id: string(),
    organization_id: string(),
    agent_id: string().optional(),
    ...timestamps,
  })
  .primaryKey("id");

const assistantAgentsRelations = relationships(assistantAgents, ({ one, many }) => ({
  user: one({
    sourceField: ["user_id"],
    destField: ["id"],
    destSchema: users,
  }),
  organization: one({
    sourceField: ["organization_id"],
    destField: ["id"],
    destSchema: organizations,
  }),
  conversations: many({
    sourceField: ["id"],
    destField: ["agent_id"],
    destSchema: assistantConversations,
  }),
}));

const assistantMessages = table("assistant_messages")
  .columns({
    id: string(),
    conversation_id: string(),
    parts: json(),
    role: string(),
    metadata: json().optional(),
    created_at: number(),
  })
  .primaryKey("id");

const assistantConversationsRelations = relationships(assistantConversations, ({ one, many }) => ({
  user: one({
    sourceField: ["user_id"],
    destField: ["id"],
    destSchema: users,
  }),
  organization: one({
    sourceField: ["organization_id"],
    destField: ["id"],
    destSchema: organizations,
  }),
  agent: one({
    sourceField: ["agent_id"],
    destField: ["id"],
    destSchema: assistantAgents,
  }),
  messages: many({
    sourceField: ["id"],
    destField: ["conversation_id"],
    destSchema: assistantMessages,
  }),
}));

const assistantMessagesRelations = relationships(assistantMessages, ({ one }) => ({
  conversation: one({
    sourceField: ["conversation_id"],
    destField: ["id"],
    destSchema: assistantConversations,
  }),
}));

export const documentComponents = table("document_components")
  .columns({
    id: string(),
    name: string(),
    properties: json(),
    organization_id: string(),
    ...timestamps,
  })
  .primaryKey("id");

const apiKeys = table("api_keys")
  .columns({
    id: string(),
    name: string(),
    partial_key: string(),
    hashed_key: string(),
    organization_id: string(),
    revoked: boolean(),
    last_used_at: number().optional(),
    ...timestamps,
  })
  .primaryKey("id");

const llmUsage = table("llm_usage")
  .columns({
    id: string(),
    conversation_id: string(),
    message_id: string().optional(),
    organization_id: string().optional(),
    source: string(), // 'document' or 'assistant'
    model: string(),
    // Credit-based tracking
    credits_used: number(),
    finish_reason: string().optional(),
    tool_calls: json().optional(),
    ...timestamps,
  })
  .primaryKey("id");

const userSettings = table("user_settings")
  .columns({
    id: string(),
    user_id: string(),
    ...timestamps,
  })
  .primaryKey("id");

const organizationSettings = table("organization_settings")
  .columns({
    id: string(),
    organization_id: string(),
    ...timestamps,
  })
  .primaryKey("id");

const integrationConnections = table("integration_connections")
  .columns({
    id: string(),
    integration_type: string(),
    organization_id: string(),
    config: json(),
    status: string(), // 'active', 'revoked', 'error', 'suspended'
    status_message: string().optional(),
    ...timestamps,
  })
  .primaryKey("id");

// Integration links - configurable "symlinks" to external sources
const integrationLinks = table("integration_links")
  .columns({
    id: string(),
    name: string(),
    connection_id: string(),
    organization_id: string(),
    integration_type: string(), // Denormalized from connection for easier querying
    config: json(), // Integration-specific: { owner, repo, branch, path } for GitHub
    last_synced_at: number().optional(),
    sync_status: string().optional(), // 'idle', 'pulling', 'pushing', 'error'
    ...timestamps,
  })
  .primaryKey("id");

const syncMetadata = table("sync_metadata")
  .columns({
    id: string(),
    document_id: string(),
    connection_id: string(),
    external_id: string(),
    last_synced_at: number().optional(),
    last_synced_hash: string().optional(),
    sync_status: string(),
    sync_error: string().optional(),
    ...timestamps,
  })
  .primaryKey("id");

const documentsRelations = relationships(documents, ({ one, many }) => ({
  parent: one({
    sourceField: ["parent_id"],
    destField: ["id"],
    destSchema: documents,
  }),
  children: many({
    sourceField: ["id"],
    destField: ["parent_id"],
    destSchema: documents,
  }),
  // Nearest collection this document belongs to
  nearestCollection: one({
    sourceField: ["nearest_collection_id"],
    destField: ["id"],
    destSchema: documents,
  }),
  // Documents that have this document as their nearest collection
  collectionDocuments: many({
    sourceField: ["id"],
    destField: ["nearest_collection_id"],
    destSchema: documents,
  }),
  // Collection schema if this document is a Collection
  collectionSchema: one({
    sourceField: ["id"],
    destField: ["document_id"],
    destSchema: collectionSchemas,
  }),
  // Field values for this document
  fieldValues: many({
    sourceField: ["id"],
    destField: ["document_id"],
    destSchema: documentFieldValues,
  }),
  organization: one({
    sourceField: ["organization_id"],
    destField: ["id"],
    destSchema: organizations,
  }),
  integrationLink: one({
    sourceField: ["integration_link_id"],
    destField: ["id"],
    destSchema: integrationLinks,
  }),
  publications: many({
    sourceField: ["id"],
    destField: ["document_id"],
    destSchema: documentPublications,
  }),
  versions: many({
    sourceField: ["id"],
    destField: ["document_id"],
    destSchema: documentVersions,
  }),
  // Links FROM this document TO other documents
  outgoingLinks: many({
    sourceField: ["id"],
    destField: ["source_document_id"],
    destSchema: documentLinks,
  }),
  // Links TO this document FROM other documents (backlinks)
  incomingLinks: many({
    sourceField: ["id"],
    destField: ["target_document_id"],
    destSchema: documentLinks,
  }),
}));

const collectionSchemasRelations = relationships(collectionSchemas, ({ one, many }) => ({
  document: one({
    sourceField: ["document_id"],
    destField: ["id"],
    destSchema: documents,
  }),
  organization: one({
    sourceField: ["organization_id"],
    destField: ["id"],
    destSchema: organizations,
  }),
  // All field values for documents in this collection
  fieldValues: many({
    sourceField: ["id"],
    destField: ["collection_schema_id"],
    destSchema: documentFieldValues,
  }),
}));

const documentFieldValuesRelations = relationships(documentFieldValues, ({ one }) => ({
  document: one({
    sourceField: ["document_id"],
    destField: ["id"],
    destSchema: documents,
  }),
  collectionSchema: one({
    sourceField: ["collection_schema_id"],
    destField: ["id"],
    destSchema: collectionSchemas,
  }),
}));

const documentVersionsRelations = relationships(documentVersions, ({ one }) => ({
  document: one({
    sourceField: ["document_id"],
    destField: ["id"],
    destSchema: documents,
  }),
  user: one({
    sourceField: ["user_id"],
    destField: ["id"],
    destSchema: users,
  }),
}));

const documentLinksRelations = relationships(documentLinks, ({ one }) => ({
  sourceDocument: one({
    sourceField: ["source_document_id"],
    destField: ["id"],
    destSchema: documents,
  }),
  targetDocument: one({
    sourceField: ["target_document_id"],
    destField: ["id"],
    destSchema: documents,
  }),
}));

const organizationsRelations = relationships(organizations, ({ one, many }) => ({
  documents: many({
    sourceField: ["id"],
    destField: ["organization_id"],
    destSchema: documents,
  }),
  collectionSchemas: many({
    sourceField: ["id"],
    destField: ["organization_id"],
    destSchema: collectionSchemas,
  }),
  members: many({
    sourceField: ["id"],
    destField: ["organization_id"],
    destSchema: members,
  }),
  invitations: many({
    sourceField: ["id"],
    destField: ["organization_id"],
    destSchema: invitations,
  }),
  documentComponents: many({
    sourceField: ["id"],
    destField: ["organization_id"],
    destSchema: documentComponents,
  }),
  assistantConversations: many({
    sourceField: ["id"],
    destField: ["organization_id"],
    destSchema: assistantConversations,
  }),
  assistantAgents: many({
    sourceField: ["id"],
    destField: ["organization_id"],
    destSchema: assistantAgents,
  }),
  apiKeys: many({
    sourceField: ["id"],
    destField: ["organization_id"],
    destSchema: apiKeys,
  }),
  llmUsage: many({
    sourceField: ["id"],
    destField: ["organization_id"],
    destSchema: llmUsage,
  }),
  integrationConnections: many({
    sourceField: ["id"],
    destField: ["organization_id"],
    destSchema: integrationConnections,
  }),
  settings: one({
    sourceField: ["id"],
    destField: ["organization_id"],
    destSchema: organizationSettings,
  }),
}));

const membersRelations = relationships(members, ({ one }) => ({
  organization: one({
    sourceField: ["organization_id"],
    destField: ["id"],
    destSchema: organizations,
  }),
  user: one({
    sourceField: ["user_id"],
    destField: ["id"],
    destSchema: users,
  }),
}));

const invitationsRelations = relationships(invitations, ({ one }) => ({
  organization: one({
    sourceField: ["organization_id"],
    destField: ["id"],
    destSchema: organizations,
  }),
  inviter: one({
    sourceField: ["inviter_id"],
    destField: ["id"],
    destSchema: users,
  }),
}));

const sessionsTable = table("sessions")
  .columns({
    id: string(),
    expires_at: number(),
    token: string(),
    ip_address: string().optional(),
    user_agent: string().optional(),
    user_id: string(),
    active_organization_id: string().optional(),
    active_team_id: string().optional(),
    impersonated_by: string().optional(),
    ...timestamps,
  })
  .primaryKey("id");

const sessionsRelations = relationships(sessionsTable, ({ one }) => ({
  user: one({
    sourceField: ["user_id"],
    destField: ["id"],
    destSchema: users,
  }),
}));

const accountsTable = table("accounts")
  .columns({
    id: string(),
    account_id: string(),
    provider_id: string(),
    user_id: string(),
    access_token: string().optional(),
    refresh_token: string().optional(),
    id_token: string().optional(),
    access_token_expires_at: number().optional(),
    refresh_token_expires_at: number().optional(),
    scope: string().optional(),
    password: string().optional(),
    ...timestamps,
  })
  .primaryKey("id");

const accountsRelations = relationships(accountsTable, ({ one }) => ({
  user: one({
    sourceField: ["user_id"],
    destField: ["id"],
    destSchema: users,
  }),
}));

const apiKeysRelations = relationships(apiKeys, ({ one }) => ({
  organization: one({
    sourceField: ["organization_id"],
    destField: ["id"],
    destSchema: organizations,
  }),
}));

const documentComponentsRelations = relationships(documentComponents, ({ one }) => ({
  organization: one({
    sourceField: ["organization_id"],
    destField: ["id"],
    destSchema: organizations,
  }),
}));

const llmUsageRelations = relationships(llmUsage, ({ one }) => ({
  organization: one({
    sourceField: ["organization_id"],
    destField: ["id"],
    destSchema: organizations,
  }),
  assistantConversation: one({
    sourceField: ["conversation_id"],
    destField: ["id"],
    destSchema: assistantConversations,
  }),
  message: one({
    sourceField: ["message_id"],
    destField: ["id"],
    destSchema: assistantMessages,
  }),
}));

const usersRelations = relationships(users, ({ many, one }) => ({
  members: many({
    sourceField: ["id"],
    destField: ["user_id"],
    destSchema: members,
  }),
  documents: many({
    sourceField: ["id"],
    destField: ["user_id"],
    destSchema: documents,
  }),
  assistantAgents: many({
    sourceField: ["id"],
    destField: ["user_id"],
    destSchema: assistantAgents,
  }),
  settings: one({
    sourceField: ["id"],
    destField: ["user_id"],
    destSchema: userSettings,
  }),
}));

const userSettingsRelations = relationships(userSettings, ({ one }) => ({
  user: one({
    sourceField: ["user_id"],
    destField: ["id"],
    destSchema: users,
  }),
}));

const organizationSettingsRelations = relationships(organizationSettings, ({ one }) => ({
  organization: one({
    sourceField: ["organization_id"],
    destField: ["id"],
    destSchema: organizations,
  }),
}));

const integrationConnectionsRelations = relationships(integrationConnections, ({ one, many }) => ({
  organization: one({
    sourceField: ["organization_id"],
    destField: ["id"],
    destSchema: organizations,
  }),
  syncMetadata: many({
    sourceField: ["id"],
    destField: ["connection_id"],
    destSchema: syncMetadata,
  }),
  links: many({
    sourceField: ["id"],
    destField: ["connection_id"],
    destSchema: integrationLinks,
  }),
}));

const integrationLinksRelations = relationships(integrationLinks, ({ one, many }) => ({
  connection: one({
    sourceField: ["connection_id"],
    destField: ["id"],
    destSchema: integrationConnections,
  }),
  organization: one({
    sourceField: ["organization_id"],
    destField: ["id"],
    destSchema: organizations,
  }),
  documents: many({
    sourceField: ["id"],
    destField: ["integration_link_id"],
    destSchema: documents,
  }),
}));

const syncMetadataRelations = relationships(syncMetadata, ({ one }) => ({
  document: one({
    sourceField: ["document_id"],
    destField: ["id"],
    destSchema: documents,
  }),
  connection: one({
    sourceField: ["connection_id"],
    destField: ["id"],
    destSchema: integrationConnections,
  }),
}));
const integrationActivityLogs = table("integration_activity_logs")
  .columns({
    id: string(),
    connection_id: string(),
    activity_type: string(),
    activity_status: string(),
    integration_type: string(),
    ...timestamps,
  })
  .primaryKey("id");

const integrationActivityLogsRelations = relationships(integrationActivityLogs, ({ one }) => ({
  connection: one({
    sourceField: ["connection_id"],
    destField: ["id"],
    destSchema: integrationConnections,
  }),
}));
const feedbackSubmissions = table("feedback_submissions")
  .columns({
    id: string(),
    user_id: string(),
    organization_id: string(),
    type: string(),
    message: string(),
    metadata: json().optional(),
    ...timestamps,
  })
  .primaryKey("id");

const feedbackSubmissionsRelations = relationships(feedbackSubmissions, ({ one }) => ({
  user: one({
    sourceField: ["user_id"],
    destField: ["id"],
    destSchema: users,
  }),
  organization: one({
    sourceField: ["organization_id"],
    destField: ["id"],
    destSchema: organizations,
  }),
}));

const templates = table("templates")
  .columns({
    id: string(),
    name: string(),
    slug: string(),
    description: string().optional(),
    teaser: string().optional(),
    detailed_description: string().optional(),
    preview_data: json().optional(),
    ...timestamps,
  })
  .primaryKey("id");

const templateDocuments = table("template_documents")
  .columns({
    id: string(),
    template_id: string(),
    title: string(),
    content: string().optional(),
    json_content: json().optional(), // Pre-processed TipTap JSON for fast marketing site access
    parent_id: string().optional(),
    sort_order: number(),
    ...timestamps,
  })
  .primaryKey("id");

const templateInstallations = table("template_installations")
  .columns({
    id: string(),
    template_id: string(),
    organization_id: string(),
    installed_by_user_id: string(),
    root_document_id: string(),
    created_at: number(),
  })
  .primaryKey("id");

const templateCategories = table("template_categories")
  .columns({
    id: string(),
    name: string(),
    slug: string(),
    ...timestamps,
  })
  .primaryKey("id");

const templateCategoryAssignments = table("template_category_assignments")
  .columns({
    id: string(),
    template_id: string(),
    category_id: string(),
    ...timestamps,
  })
  .primaryKey("id");

const templateFaqs = table("template_faqs")
  .columns({
    id: string(),
    template_id: string(),
    question: string(),
    answer: string(),
    sort_order: number(),
    ...timestamps,
  })
  .primaryKey("id");

// Billing tables
const workspaceBilling = table("workspace_billing")
  .columns({
    id: string(),
    organization_id: string(),
    plan: string(),
    stripe_subscription_id: string().optional(),
    stripe_subscription_status: string().optional(),
    billing_owner_user_id: string(),
    current_period_start: number().optional(),
    current_period_end: number().optional(),
    canceled_at: number().optional(),
    cancel_at_period_end: boolean(),
    ...timestamps,
  })
  .primaryKey("id");

const userWorkspaceCredits = table("user_workspace_credits")
  .columns({
    id: string(),
    user_id: string(),
    organization_id: string(),
    credits_included_monthly: number(),
    credits_used_this_period: number(),
    credits_available: number(),
    current_period_start: number().optional(),
    current_period_end: number().optional(),
    removed_at: number().optional(),
    ...timestamps,
  })
  .primaryKey("id");

const stripeCustomers = table("stripe_customers")
  .columns({
    id: string(),
    user_id: string(),
    email: string(),
    ...timestamps,
  })
  .primaryKey("id");

const creditUsageLog = table("credit_usage_log")
  .columns({
    id: string(),
    organization_id: string(),
    credits_consumed: number(),
    action_type: string(),
    resource_id: string().optional(),
    stripe_meter_event_id: string().optional(),
    user_id: string().optional(),
    created_at: number(),
  })
  .primaryKey("id");

const templatesRelations = relationships(templates, ({ many }) => ({
  documents: many({
    sourceField: ["id"],
    destField: ["template_id"],
    destSchema: templateDocuments,
  }),
  installations: many({
    sourceField: ["id"],
    destField: ["template_id"],
    destSchema: templateInstallations,
  }),
  categoryAssignments: many({
    sourceField: ["id"],
    destField: ["template_id"],
    destSchema: templateCategoryAssignments,
  }),
  faqs: many({
    sourceField: ["id"],
    destField: ["template_id"],
    destSchema: templateFaqs,
  }),
}));
const templateDocumentsRelations = relationships(templateDocuments, ({ one, many }) => ({
  template: one({
    sourceField: ["template_id"],
    destField: ["id"],
    destSchema: templates,
  }),
  parent: one({
    sourceField: ["parent_id"],
    destField: ["id"],
    destSchema: templateDocuments,
  }),
  children: many({
    sourceField: ["id"],
    destField: ["parent_id"],
    destSchema: templateDocuments,
  }),
}));
const templateInstallationsRelations = relationships(templateInstallations, ({ one }) => ({
  template: one({
    sourceField: ["template_id"],
    destField: ["id"],
    destSchema: templates,
  }),
  organization: one({
    sourceField: ["organization_id"],
    destField: ["id"],
    destSchema: organizations,
  }),
  installedBy: one({
    sourceField: ["installed_by_user_id"],
    destField: ["id"],
    destSchema: users,
  }),
  rootDocument: one({
    sourceField: ["root_document_id"],
    destField: ["id"],
    destSchema: documents,
  }),
}));
const templateCategoriesRelations = relationships(templateCategories, ({ many }) => ({
  assignments: many({
    sourceField: ["id"],
    destField: ["category_id"],
    destSchema: templateCategoryAssignments,
  }),
}));
const templateCategoryAssignmentsRelations = relationships(
  templateCategoryAssignments,
  ({ one }) => ({
    template: one({
      sourceField: ["template_id"],
      destField: ["id"],
      destSchema: templates,
    }),
    category: one({
      sourceField: ["category_id"],
      destField: ["id"],
      destSchema: templateCategories,
    }),
  }),
);
const templateFaqsRelations = relationships(templateFaqs, ({ one }) => ({
  template: one({
    sourceField: ["template_id"],
    destField: ["id"],
    destSchema: templates,
  }),
}));

const workspaceBillingRelations = relationships(workspaceBilling, ({ one }) => ({
  organization: one({
    sourceField: ["organization_id"],
    destField: ["id"],
    destSchema: organizations,
  }),
  billingOwner: one({
    sourceField: ["billing_owner_user_id"],
    destField: ["id"],
    destSchema: users,
  }),
}));

const userWorkspaceCreditsRelations = relationships(userWorkspaceCredits, ({ one }) => ({
  user: one({
    sourceField: ["user_id"],
    destField: ["id"],
    destSchema: users,
  }),
  organization: one({
    sourceField: ["organization_id"],
    destField: ["id"],
    destSchema: organizations,
  }),
}));

const stripeCustomersRelations = relationships(stripeCustomers, ({ one }) => ({
  user: one({
    sourceField: ["user_id"],
    destField: ["id"],
    destSchema: users,
  }),
}));

const creditUsageLogRelations = relationships(creditUsageLog, ({ one }) => ({
  organization: one({
    sourceField: ["organization_id"],
    destField: ["id"],
    destSchema: organizations,
  }),
  user: one({
    sourceField: ["user_id"],
    destField: ["id"],
    destSchema: users,
  }),
}));

export const schema = createSchema({
  tables: [
    users,
    documents,
    collectionSchemas,
    documentFieldValues,
    documentVersions,
    documentLinks,
    organizations,
    members,
    invitations,
    documentComponents,
    assistantAgents,
    assistantConversations,
    assistantMessages,
    apiKeys,
    llmUsage,
    userSettings,
    organizationSettings,
    integrationConnections,
    integrationLinks,
    syncMetadata,
    integrationActivityLogs,
    documentPublications,
    feedbackSubmissions,
    templates,
    templateDocuments,
    templateInstallations,
    templateCategories,
    templateCategoryAssignments,
    templateFaqs,
    workspaceBilling,
    userWorkspaceCredits,
    stripeCustomers,
    creditUsageLog,
    sessionsTable,
    accountsTable,
  ],
  relationships: [
    documentsRelations,
    collectionSchemasRelations,
    documentFieldValuesRelations,
    documentVersionsRelations,
    documentLinksRelations,
    organizationsRelations,
    membersRelations,
    invitationsRelations,
    usersRelations,
    documentComponentsRelations,
    assistantAgentsRelations,
    assistantConversationsRelations,
    assistantMessagesRelations,
    apiKeysRelations,
    llmUsageRelations,
    userSettingsRelations,
    organizationSettingsRelations,
    integrationConnectionsRelations,
    integrationLinksRelations,
    syncMetadataRelations,
    integrationActivityLogsRelations,
    documentPublicationsRelations,
    feedbackSubmissionsRelations,
    templatesRelations,
    templateDocumentsRelations,
    templateInstallationsRelations,
    templateCategoriesRelations,
    templateCategoryAssignmentsRelations,
    templateFaqsRelations,
    workspaceBillingRelations,
    userWorkspaceCreditsRelations,
    stripeCustomersRelations,
    creditUsageLogRelations,
    sessionsRelations,
    accountsRelations,
  ],
});

export type Schema = typeof schema;

export const zql = createBuilder(schema);

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    schema: Schema;
  }
}
