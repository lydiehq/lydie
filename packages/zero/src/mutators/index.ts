import { defineMutators } from "@rocicorp/zero";

import { agentMutators } from "./agent";
import { apiKeyMutators } from "./api-key";
import { assistantMutators } from "./assistant";
import { documentMutators } from "./document";
import { documentComponentMutators } from "./document-component";
import { feedbackMutators } from "./feedback";
import { integrationMutators } from "./integration";
import { integrationConnectionMutators } from "./integration-connection";
import { organizationMutators } from "./organization";
import { syncMetadataMutators } from "./sync-metadata";
import { templateMutators } from "./template";
import { templateCategoryMutators } from "./template-category";
import { userSettingsMutators } from "./user-settings";

export const mutators = defineMutators({
  document: documentMutators,
  documentComponent: documentComponentMutators,
  assistantConversation: assistantMutators,
  apiKey: apiKeyMutators,
  userSettings: userSettingsMutators,
  organization: organizationMutators,
  integration: integrationMutators,
  integrationConnection: integrationConnectionMutators,
  syncMetadata: syncMetadataMutators,
  feedback: feedbackMutators,
  agents: agentMutators,
  template: templateMutators,
  templateCategory: templateCategoryMutators,
});

export type Mutators = typeof mutators;
