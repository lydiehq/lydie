import { integrationMetadata } from "@lydie/integrations/metadata";

export interface Integration {
  id: string;
  title: string;
  description: string;
  icon?: string;
  extendedDescription?: string;
}

// Map IntegrationMetadata to Integration format for landing pages
export const integrations: Integration[] = integrationMetadata.map((meta) => ({
  id: meta.id,
  title: meta.name,
  description: meta.description,
  icon: meta.icon,
  extendedDescription: meta.extendedDescription,
}));

export function getIntegration(id: string): Integration | undefined {
  return integrations.find((integration) => integration.id === id);
}
