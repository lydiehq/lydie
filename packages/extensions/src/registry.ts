import type { SyncExtension } from "./extension";

/**
 * Registry for managing available sync extensions
 */
export class ExtensionRegistry {
  private extensions = new Map<string, SyncExtension>();

  /**
   * Register a new extension
   */
  register(extension: SyncExtension): void {
    if (this.extensions.has(extension.type)) {
      throw new Error(`Extension ${extension.type} is already registered`);
    }
    this.extensions.set(extension.type, extension);
  }

  /**
   * Get an extension by its type
   */
  get(type: string): SyncExtension | undefined {
    return this.extensions.get(type);
  }

  /**
   * Get all registered extensions
   */
  getAll(): SyncExtension[] {
    return Array.from(this.extensions.values());
  }

  /**
   * Check if an extension type is registered
   */
  has(type: string): boolean {
    return this.extensions.has(type);
  }
}

/**
 * Global registry instance
 */
export const extensionRegistry = new ExtensionRegistry();
