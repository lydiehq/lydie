import { defineQueries } from "@rocicorp/zero";

import type { Context } from "../auth";

import { agentQueries } from "./agent";
import { apiKeyQueries } from "./api-key";
import { assistantQueries } from "./assistant";
import { componentQueries } from "./component";
import { seatQueries } from "./seat";
import { documentQueries } from "./document";
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
  components: componentQueries,
  apiKeys: apiKeyQueries,
  members: memberQueries,
  seats: seatQueries,
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
});
