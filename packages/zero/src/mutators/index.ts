import { defineMutators } from "@rocicorp/zero";

import { agentMutators } from "./agent";
import { apiKeyMutators } from "./api-key";
import { assistantMutators } from "./assistant";
import { collectionMutators } from "./collection";
import { documentMutators } from "./document";
import { documentComponentMutators } from "./document-component";
import { documentVersionMutators } from "./document-version";
import { feedbackMutators } from "./feedback";
import { integrationMutators } from "./integration";
import { integrationConnectionMutators } from "./integration-connection";
import { organizationMutators } from "./organization";
import { syncMetadataMutators } from "./sync-metadata";
import { templateMutators } from "./template";
import { templateCategoryMutators } from "./template-category";
import { templateFaqMutators } from "./template-faq";
import { userSettingsMutators } from "./user-settings";

export const mutators = defineMutators({
  document: documentMutators,
  documentVersion: documentVersionMutators,
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
  templateFaq: templateFaqMutators,
  collection: collectionMutators,
});

export type Mutators = typeof mutators;
