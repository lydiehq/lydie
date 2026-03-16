import { defineQueries } from "@rocicorp/zero";

import type { Context } from "../auth";
import { agentQueries } from "./agent";
import { apiKeyQueries } from "./api-key";
import { assistantQueries } from "./assistant";
import { billingQueries } from "./billing";
import { collectionQueries } from "./collection";
import { componentQueries } from "./component";
import { documentQueries } from "./document";
import { documentVersionQueries } from "./document-version";
import { invitationQueries } from "./invitation";
import { memberQueries } from "./member";
import { organizationQueries } from "./organization";
import { settingsQueries } from "./settings";
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
  templates: templateQueries,
  templateCategories: templateCategoryQueries,
  billing: billingQueries,
  collections: collectionQueries,
});
