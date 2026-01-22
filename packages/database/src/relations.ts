import * as schema from "./schema"
import { defineRelations } from "drizzle-orm"

export const relations = defineRelations(schema, (r) => ({
  documentsTable: {
    user: r.one.usersTable({
      from: r.documentsTable.userId,
      to: r.usersTable.id,
    }),
    organization: r.one.organizationsTable({
      from: r.documentsTable.organizationId,
      to: r.organizationsTable.id,
    }),
    integrationLink: r.one.integrationLinksTable({
      from: r.documentsTable.integrationLinkId,
      to: r.integrationLinksTable.id,
    }),
    embeddings: r.many.documentEmbeddingsTable(),
    titleEmbeddings: r.many.documentTitleEmbeddingsTable(),
    syncMetadata: r.many.syncMetadataTable(),
    publications: r.many.documentPublicationsTable(),
  },
  documentEmbeddingsTable: {
    document: r.one.documentsTable({
      from: r.documentEmbeddingsTable.documentId,
      to: r.documentsTable.id,
    }),
  },
  documentTitleEmbeddingsTable: {
    document: r.one.documentsTable({
      from: r.documentTitleEmbeddingsTable.documentId,
      to: r.documentsTable.id,
    }),
  },
  assistantAgentsTable: {
    user: r.one.usersTable({
      from: r.assistantAgentsTable.userId,
      to: r.usersTable.id,
    }),
    organization: r.one.organizationsTable({
      from: r.assistantAgentsTable.organizationId,
      to: r.organizationsTable.id,
    }),
    conversations: r.many.assistantConversationsTable(),
  },

  assistantConversationsTable: {
    user: r.one.usersTable({
      from: r.assistantConversationsTable.userId,
      to: r.usersTable.id,
    }),
    organization: r.one.organizationsTable({
      from: r.assistantConversationsTable.organizationId,
      to: r.organizationsTable.id,
    }),
    agent: r.one.assistantAgentsTable({
      from: r.assistantConversationsTable.agentId,
      to: r.assistantAgentsTable.id,
    }),
    messages: r.many.assistantMessagesTable(),
    llmUsage: r.many.llmUsageTable({
      from: r.assistantConversationsTable.id,
      to: r.llmUsageTable.conversationId,
    }),
  },

  assistantMessagesTable: {
    conversation: r.one.assistantConversationsTable({
      from: r.assistantMessagesTable.conversationId,
      to: r.assistantConversationsTable.id,
    }),
    llmUsage: r.many.llmUsageTable({
      from: r.assistantMessagesTable.id,
      to: r.llmUsageTable.messageId,
    }),
  },

  organizationsTable: {
    members: r.many.membersTable(),
    invitations: r.many.invitationsTable(),
    documents: r.many.documentsTable(),
    assistantConversations: r.many.assistantConversationsTable(),
    assistantAgents: r.many.assistantAgentsTable(),
    apiKeys: r.many.apiKeysTable(),
    documentComponents: r.many.documentComponentsTable(),
    llmUsage: r.many.llmUsageTable(),
    integrationConnections: r.many.integrationConnectionsTable(),
    settings: r.one.organizationSettingsTable({
      from: r.organizationsTable.id,
      to: r.organizationSettingsTable.organizationId,
    }),
  },

  membersTable: {
    user: r.one.usersTable({
      from: r.membersTable.userId,
      to: r.usersTable.id,
    }),
    organization: r.one.organizationsTable({
      from: r.membersTable.organizationId,
      to: r.organizationsTable.id,
    }),
  },

  invitationsTable: {
    organization: r.one.organizationsTable({
      from: r.invitationsTable.organizationId,
      to: r.organizationsTable.id,
    }),
    inviter: r.one.usersTable({
      from: r.invitationsTable.inviterId,
      to: r.usersTable.id,
    }),
  },

  sessionsTable: {
    user: r.one.usersTable({
      from: r.sessionsTable.userId,
      to: r.usersTable.id,
    }),
  },

  accountsTable: {
    user: r.one.usersTable({
      from: r.accountsTable.userId,
      to: r.usersTable.id,
    }),
  },

  apiKeysTable: {
    organization: r.one.organizationsTable({
      from: r.apiKeysTable.organizationId,
      to: r.organizationsTable.id,
    }),
  },

  documentComponentsTable: {
    organization: r.one.organizationsTable({
      from: r.documentComponentsTable.organizationId,
      to: r.organizationsTable.id,
    }),
  },

  llmUsageTable: {
    organization: r.one.organizationsTable({
      from: r.llmUsageTable.organizationId,
      to: r.organizationsTable.id,
    }),
    assistantConversation: r.one.assistantConversationsTable({
      from: r.llmUsageTable.conversationId,
      to: r.assistantConversationsTable.id,
    }),
    message: r.one.assistantMessagesTable({
      from: r.llmUsageTable.messageId,
      to: r.assistantMessagesTable.id,
    }),
  },

  usersTable: {
    documents: r.many.documentsTable(),
    assistantConversations: r.many.assistantConversationsTable(),
    assistantAgents: r.many.assistantAgentsTable(),
    members: r.many.membersTable(),
    invitationsSent: r.many.invitationsTable(),
    sessions: r.many.sessionsTable(),
    accounts: r.many.accountsTable(),
    settings: r.one.userSettingsTable({
      from: r.usersTable.id,
      to: r.userSettingsTable.userId,
    }),
  },

  userSettingsTable: {
    user: r.one.usersTable({
      from: r.userSettingsTable.userId,
      to: r.usersTable.id,
    }),
  },

  organizationSettingsTable: {
    organization: r.one.organizationsTable({
      from: r.organizationSettingsTable.organizationId,
      to: r.organizationsTable.id,
    }),
  },

  integrationConnectionsTable: {
    organization: r.one.organizationsTable({
      from: r.integrationConnectionsTable.organizationId,
      to: r.organizationsTable.id,
    }),
    syncMetadata: r.many.syncMetadataTable(),
    links: r.many.integrationLinksTable(),
    logs: r.many.integrationActivityLogsTable(),
  },

  integrationLinksTable: {
    connection: r.one.integrationConnectionsTable({
      from: r.integrationLinksTable.connectionId,
      to: r.integrationConnectionsTable.id,
    }),
    organization: r.one.organizationsTable({
      from: r.integrationLinksTable.organizationId,
      to: r.organizationsTable.id,
    }),
    documents: r.many.documentsTable(),
  },

  syncMetadataTable: {
    document: r.one.documentsTable({
      from: r.syncMetadataTable.documentId,
      to: r.documentsTable.id,
    }),
    connection: r.one.integrationConnectionsTable({
      from: r.syncMetadataTable.connectionId,
      to: r.integrationConnectionsTable.id,
    }),
  },
  integrationActivityLogsTable: {
    connection: r.one.integrationConnectionsTable({
      from: r.integrationActivityLogsTable.connectionId,
      to: r.integrationConnectionsTable.id,
    }),
  },
  documentPublicationsTable: {
    document: r.one.documentsTable({
      from: r.documentPublicationsTable.documentId,
      to: r.documentsTable.id,
    }),
    organization: r.one.organizationsTable({
      from: r.documentPublicationsTable.organizationId,
      to: r.organizationsTable.id,
    }),
  },
}))
