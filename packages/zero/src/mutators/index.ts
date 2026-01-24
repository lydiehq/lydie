import { defineMutators } from "@rocicorp/zero"
import { documentMutators } from "./document"
import { documentComponentMutators } from "./document-component"
import { assistantMutators } from "./assistant"
import { apiKeyMutators } from "./api-key"
import { userSettingsMutators } from "./user-settings"
import { organizationSettingsMutators } from "./organization-settings"
import { organizationMutators } from "./organization"
import { integrationMutators } from "./integration"
import { integrationConnectionMutators } from "./integration-connection"
import { syncMetadataMutators } from "./sync-metadata"
import { feedbackMutators } from "./feedback"
import { agentMutators } from "./agent"
import { templateMutators } from "./template"

export const mutators = defineMutators({
  document: documentMutators,
  documentComponent: documentComponentMutators,
  assistantConversation: assistantMutators,
  apiKey: apiKeyMutators,
  userSettings: userSettingsMutators,
  organizationSettings: organizationSettingsMutators,
  organization: organizationMutators,
  integration: integrationMutators,
  integrationConnection: integrationConnectionMutators,
  syncMetadata: syncMetadataMutators,
  feedback: feedbackMutators,
  agents: agentMutators,
  template: templateMutators,
})

export type Mutators = typeof mutators
