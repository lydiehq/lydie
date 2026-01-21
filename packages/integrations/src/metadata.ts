/**
 * Client-safe integration metadata
 * This file exports static metadata about available integrations
 * without requiring server-side code or integration instances.
 *
 * Each integration defines its own metadata in a metadata.json file
 * within its folder (e.g., /integrations/github/metadata.json).
 */

export interface IntegrationMetadata {
  /**
   * Unique identifier for this integration type (e.g., "github", "shopify", "wordpress")
   */
  id: string

  /**
   * Human-readable name of the integration
   */
  name: string

  /**
   * Description of what this integration does
   */
  description: string

  /**
   * Whether this integration is coming soon (not yet available)
   */
  comingSoon?: boolean

  /**
   * Optional path to the icon image in the integration's assets folder
   * (e.g., "icon.png" or "icon.svg")
   */
  icon?: string

  /**
   * Authentication type for this integration
   * - "oauth": Uses OAuth flow (redirects to provider)
   * - "manual": Requires manual credential entry (e.g., API keys, passwords)
   */
  authType?: "oauth" | "manual"

  /**
   * Extended description for landing pages
   * A longer, more detailed description with overview, features, and instructions
   */
  extendedDescription?: string
}

// Import metadata from each integration's metadata.json file
// These are static JSON imports that work in both client and server contexts
import githubMetadata from "./integrations/github/metadata.json"
import shopifyMetadata from "./integrations/shopify/metadata.json"
import wordpressMetadata from "./integrations/wordpress/metadata.json"

/**
 * Metadata for all available integrations
 * This is a static list that can be safely imported in client-side code
 * Each integration's metadata is defined in its own metadata.json file
 */
export const integrationMetadata: IntegrationMetadata[] = [githubMetadata, shopifyMetadata, wordpressMetadata]

/**
 * Get metadata for a specific integration by ID
 */
export function getIntegrationMetadata(id: string): IntegrationMetadata | undefined {
  return integrationMetadata.find((meta) => meta.id === id)
}

/**
 * Get all available (non-coming-soon) integrations
 */
export function getAvailableIntegrations(): IntegrationMetadata[] {
  return integrationMetadata.filter((meta) => !meta.comingSoon)
}
