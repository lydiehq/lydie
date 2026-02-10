import { defineQueries } from "@rocicorp/zero";

import type { Context } from "../auth";

import { agentQueries } from "./agent";
import { apiKeyQueries } from "./api-key";
import { assistantQueries } from "./assistant";
import { billingQueries } from "./billing";
import { componentQueries } from "./component";
import { documentQueries } from "./document";
import { documentVersionQueries } from "./document-version";
import { integrationQueries } from "./integration";
import { integrationActivityQueries } from "./integration-activity";
import { integrationLinkQueries } from "./integration-link";
import { invitationQueries } from "./invitation";
import { memberQueries } from "./member";
import { organizationQueries } from "./organization";
import { settingsQueries } from "./settings";
import { syncMetadataQueries } from "./sync-metadata";
import { templateQueries } from "./template";
import { templateCategoryQueries } from "./template-category";

export type QueryContext = Context;

export const queries = defineQueries({
  documents: documentQueries,
  documentVersions: documentVersionQueries,
  components: componentQueries,
  apiKeys: apiKeyQueries,
  members: memberQueries,
  invitations: invitationQueries,
  organizations: organizationQueries,
  assistant: assistantQueries,
  agents: agentQueries,
  settings: settingsQueries,
  integrations: integrationQueries,
  integrationLinks: integrationLinkQueries,
  syncMetadata: syncMetadataQueries,
  integrationActivityLogs: integrationActivityQueries,
  templates: templateQueries,
  templateCategories: templateCategoryQueries,
  billing: billingQueries,
});
