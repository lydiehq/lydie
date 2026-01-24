import { defineQueries } from "@rocicorp/zero"
import { documentQueries } from "./document"
import { componentQueries } from "./component"
import { apiKeyQueries } from "./api-key"
import { memberQueries } from "./member"
import { invitationQueries } from "./invitation"
import { organizationQueries } from "./organization"
import { assistantQueries } from "./assistant"
import { agentQueries } from "./agent"
import { usageQueries } from "./usage"
import { settingsQueries } from "./settings"
import { integrationQueries } from "./integration"
import { integrationLinkQueries } from "./integration-link"
import { syncMetadataQueries } from "./sync-metadata"
import { integrationActivityQueries } from "./integration-activity"
import type { Context } from "../auth"

export type QueryContext = Context

export const queries = defineQueries({
  documents: documentQueries,
  components: componentQueries,
  apiKeys: apiKeyQueries,
  members: memberQueries,
  invitations: invitationQueries,
  organizations: organizationQueries,
  assistant: assistantQueries,
  agents: agentQueries,
  usage: usageQueries,
  settings: settingsQueries,
  integrations: integrationQueries,
  integrationLinks: integrationLinkQueries,
  syncMetadata: syncMetadataQueries,
  integrationActivityLogs: integrationActivityQueries,
})
