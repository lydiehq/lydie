import type { Integration } from "@lydie/core/integrations"
import { githubIntegration } from "./integrations/github"
import { shopifyIntegration } from "./integrations/shopify"
import { wordpressIntegration } from "./integrations/wordpress"

export const integrations = {
	github: githubIntegration,
	shopify: shopifyIntegration,
	wordpress: wordpressIntegration,
} as const satisfies Record<string, Integration>

export type IntegrationType = keyof typeof integrations

export function getIntegration(type: string): Integration | undefined {
	return integrations[type as IntegrationType]
}

export const integrationRegistry = new Map<string, Integration>(Object.entries(integrations))
