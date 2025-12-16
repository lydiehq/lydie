import type { Integration } from "./integration";

/**
 * Registry for managing available sync integrations
 */
export class IntegrationRegistry {
  private integrations = new Map<string, Integration>();

  /**
   * Register a new integration
   */
  register(integration: Integration): void {
    if (this.integrations.has(integration.type)) {
      throw new Error(`Integration ${integration.type} is already registered`);
    }
    this.integrations.set(integration.type, integration);
  }

  /**
   * Get an integration by its type
   */
  get(type: string): Integration | undefined {
    return this.integrations.get(type);
  }

  /**
   * Get all registered integrations
   */
  getAll(): Integration[] {
    return Array.from(this.integrations.values());
  }

  /**
   * Check if an integration type is registered
   */
  has(type: string): boolean {
    return this.integrations.has(type);
  }
}

/**
 * Global registry instance
 */
export const integrationRegistry = new IntegrationRegistry();
