/**
 * Integration icon loader
 *
 * Icons are served from the public folder at: /integrations/{id}/assets/{icon}
 * where {icon} is specified in the metadata.json file (e.g., "icon.png" or "logo.png")
 *
 * Assets are copied to the public folder by the copy-integration-assets script
 * before the build process, ensuring they're available at runtime.
 */

import {
  getIntegrationMetadata,
  integrationMetadata,
} from "@lydie/integrations/client";

/**
 * Get the icon URL for an integration by its ID
 * Uses the metadata.json to determine which icon file to load
 * Returns null if no icon is available for the integration
 */
export function getIntegrationIconUrl(integrationId: string): string | null {
  // Get the metadata to find the icon filename
  const metadata = getIntegrationMetadata(integrationId);
  const iconFilename = metadata?.icon;

  if (!iconFilename) {
    return null;
  }

  // Return the public URL path to the icon
  // Assets are in public/integrations/{id}/assets/{icon}
  return `/integrations/${integrationId}/assets/${iconFilename}`;
}

/**
 * Get all available integration icon URLs
 * Returns a map of integration ID to icon URL
 */
export function getAllIntegrationIcons(): Record<string, string> {
  const icons: Record<string, string> = {};

  for (const meta of integrationMetadata) {
    if (meta.icon) {
      icons[meta.id] = `/integrations/${meta.id}/assets/${meta.icon}`;
    }
  }

  return icons;
}
