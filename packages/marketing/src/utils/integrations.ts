import { integrations as integrationData } from "../data/integrations";

export interface Integration {
  id: string;
  title: string;
  description: string;
  icon?: string;
  extendedDescription?: string;
}

export const integrations: Integration[] = integrationData.map((integration) => ({
  id: integration.id,
  title: integration.name,
  description: integration.description,
}));

export function getIntegration(id: string): Integration | undefined {
  return integrations.find((integration) => integration.id === id);
}
