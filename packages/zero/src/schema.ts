import {
  table,
  string,
  number,
  createSchema,
  relationships,
  json,
  boolean,
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
    // Subscription info synced from Polar via webhooks
    subscription_status: string(),
    subscription_plan: string(),
    polar_subscription_id: string().optional(),
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

const documents = table("documents")
  .columns({
    id: string(),
    title: string(),
    slug: string(),
    json_content: json().optional(),
    user_id: string(),
    organization_id: string(),
    index_status: string(),
    folder_id: string().optional(),
    published: boolean(),
    deleted_at: number().optional(),
    ...timestamps,
  })
  .primaryKey("id");

const folders = table("folders")
  .columns({
    id: string(),
    name: string(),
    parent_id: string().optional(),
    user_id: string(),
    organization_id: string(),
    deleted_at: number().optional(),
    ...timestamps,
  })
  .primaryKey("id");

const documentConversations = table("document_conversations")
  .columns({
    id: string(),
    title: string().optional(),
    user_id: string(),
    document_id: string(),
    ...timestamps,
  })
  .primaryKey("id");

const documentMessages = table("document_messages")
  .columns({
    id: string(),
    conversation_id: string(),
    parts: json(),
    role: string(),
    metadata: json().optional(),
    created_at: number(),
  })
  .primaryKey("id");

const assistantConversations = table("assistant_conversations")
  .columns({
    id: string(),
    title: string().optional(),
    user_id: string(),
    organization_id: string(),
    ...timestamps,
  })
  .primaryKey("id");

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
    prompt_tokens: number(),
    completion_tokens: number(),
    total_tokens: number(),
    finish_reason: string().optional(),
    tool_calls: json().optional(),
    ...timestamps,
  })
  .primaryKey("id");

const userSettings = table("user_settings")
  .columns({
    id: string(),
    user_id: string(),
    persist_document_tree_expansion: boolean(),
    ai_prompt_style: string(),
    custom_prompt: string().optional(),
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

const documentsRelations = relationships(documents, ({ one, many }) => ({
  folder: one({
    sourceField: ["folder_id"],
    destField: ["id"],
    destSchema: folders,
  }),
  organization: one({
    sourceField: ["organization_id"],
    destField: ["id"],
    destSchema: organizations,
  }),
  conversations: many({
    sourceField: ["id"],
    destField: ["document_id"],
    destSchema: documentConversations,
  }),
}));

const foldersRelations = relationships(folders, ({ one, many }) => ({
  user: one({
    sourceField: ["user_id"],
    destField: ["id"],
    destSchema: users,
  }),
  parent: one({
    sourceField: ["parent_id"],
    destField: ["id"],
    destSchema: folders,
  }),
  children: many({
    sourceField: ["id"],
    destField: ["parent_id"],
    destSchema: folders,
  }),
  documents: many({
    sourceField: ["id"],
    destField: ["folder_id"],
    destSchema: documents,
  }),
  organization: one({
    sourceField: ["organization_id"],
    destField: ["id"],
    destSchema: organizations,
  }),
}));

const organizationsRelations = relationships(
  organizations,
  ({ one, many }) => ({
    documents: many({
      sourceField: ["id"],
      destField: ["organization_id"],
      destSchema: documents,
    }),
    folders: many({
      sourceField: ["id"],
      destField: ["organization_id"],
      destSchema: folders,
    }),
    members: many({
      sourceField: ["id"],
      destField: ["organization_id"],
      destSchema: members,
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
    settings: one({
      sourceField: ["id"],
      destField: ["organization_id"],
      destSchema: organizationSettings,
    }),
  })
);

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

const usersRelations = relationships(users, ({ many, one }) => ({
  members: many({
    sourceField: ["id"],
    destField: ["user_id"],
    destSchema: members,
  }),
  folders: many({
    sourceField: ["id"],
    destField: ["user_id"],
    destSchema: folders,
  }),
  documents: many({
    sourceField: ["id"],
    destField: ["user_id"],
    destSchema: documents,
  }),
  settings: one({
    sourceField: ["id"],
    destField: ["user_id"],
    destSchema: userSettings,
  }),
}));

const documentComponentsRelations = relationships(
  documentComponents,
  ({ one }) => ({
    organization: one({
      sourceField: ["organization_id"],
      destField: ["id"],
      destSchema: organizations,
    }),
  })
);

const apiKeysRelations = relationships(apiKeys, ({ one }) => ({
  organization: one({
    sourceField: ["organization_id"],
    destField: ["id"],
    destSchema: organizations,
  }),
}));

const documentConversationsRelations = relationships(
  documentConversations,
  ({ one, many }) => ({
    user: one({
      sourceField: ["user_id"],
      destField: ["id"],
      destSchema: users,
    }),
    document: one({
      sourceField: ["document_id"],
      destField: ["id"],
      destSchema: documents,
    }),
    messages: many({
      sourceField: ["id"],
      destField: ["conversation_id"],
      destSchema: documentMessages,
    }),
  })
);

const documentMessagesRelations = relationships(
  documentMessages,
  ({ one }) => ({
    conversation: one({
      sourceField: ["conversation_id"],
      destField: ["id"],
      destSchema: documentConversations,
    }),
  })
);

const assistantConversationsRelations = relationships(
  assistantConversations,
  ({ one, many }) => ({
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
    messages: many({
      sourceField: ["id"],
      destField: ["conversation_id"],
      destSchema: assistantMessages,
    }),
  })
);

const assistantMessagesRelations = relationships(
  assistantMessages,
  ({ one }) => ({
    conversation: one({
      sourceField: ["conversation_id"],
      destField: ["id"],
      destSchema: assistantConversations,
    }),
  })
);

const llmUsageRelations = relationships(llmUsage, ({ one }) => ({
  organization: one({
    sourceField: ["organization_id"],
    destField: ["id"],
    destSchema: organizations,
  }),
  documentConversation: one({
    sourceField: ["conversation_id"],
    destField: ["id"],
    destSchema: documentConversations,
  }),
  assistantConversation: one({
    sourceField: ["conversation_id"],
    destField: ["id"],
    destSchema: assistantConversations,
  }),
  message: one({
    sourceField: ["message_id"],
    destField: ["id"],
    destSchema: documentMessages,
  }),
}));

const userSettingsRelations = relationships(userSettings, ({ one }) => ({
  user: one({
    sourceField: ["user_id"],
    destField: ["id"],
    destSchema: users,
  }),
}));

const organizationSettingsRelations = relationships(
  organizationSettings,
  ({ one }) => ({
    organization: one({
      sourceField: ["organization_id"],
      destField: ["id"],
      destSchema: organizations,
    }),
  })
);

export const schema = createSchema({
  tables: [
    users,
    documents,
    folders,
    organizations,
    members,
    documentComponents,
    documentConversations,
    documentMessages,
    assistantConversations,
    assistantMessages,
    apiKeys,
    llmUsage,
    userSettings,
    organizationSettings,
  ],
  relationships: [
    documentsRelations,
    foldersRelations,
    organizationsRelations,
    membersRelations,
    usersRelations,
    documentComponentsRelations,
    documentConversationsRelations,
    documentMessagesRelations,
    assistantConversationsRelations,
    assistantMessagesRelations,
    apiKeysRelations,
    llmUsageRelations,
    userSettingsRelations,
    organizationSettingsRelations,
  ],
  enableLegacyQueries: false,
  enableLegacyMutators: false,
});

export type Schema = typeof schema;