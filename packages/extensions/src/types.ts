/**
 * Base types for document sync extensions
 */

/**
 * The document structure that extensions will work with
 */
export interface SyncDocument {
  id: string;
  title: string;
  slug: string;
  content: any; // TipTap JSON structure
  published: boolean;
  updatedAt: Date;
  organizationId: string;
  folderId?: string | null; // Optional folder ID for maintaining folder structure
  folderPath?: string | null; // Optional folder path (e.g., "docs/guides") for folder creation
}

/**
 * Configuration for connecting to an external platform
 * Matches the extensionConnectionsTable schema
 */
export interface ExtensionConnection {
  id: string;
  extensionType: string;
  organizationId: string;
  config: Record<string, any>; // Platform-specific config (API keys, repo info, etc.)
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Represents the result of a sync operation
 */
export interface SyncResult {
  success: boolean;
  documentId: string;
  externalId?: string; // ID in the external system (e.g., GitHub file path)
  message?: string;
  error?: string;
  conflictDetected?: boolean;
  conflictDetails?: ConflictDetails;
  metadata?: any; // Additional data (e.g., pulled document content)
}

/**
 * Details about a conflict that needs resolution
 */
export interface ConflictDetails {
  localVersion: {
    content: any;
    updatedAt: Date;
  };
  remoteVersion: {
    content: any;
    updatedAt: Date;
  };
  conflictType: "content" | "deleted" | "renamed";
}

/**
 * Options for push sync operation
 */
export interface PushOptions {
  document: SyncDocument;
  connection: ExtensionConnection;
  resolveConflicts?: boolean;
  commitMessage?: string;
}

/**
 * Options for pull sync operation
 */
export interface PullOptions {
  connection: ExtensionConnection;
  organizationId: string;
  userId: string;
}

/**
 * Pulled document from external platform
 */
export interface PulledDocument {
  externalId: string; // ID/path in external system
  title: string;
  content: any; // TipTap JSON
  slug: string;
}

/**
 * Metadata about synced documents
 * Matches the syncMetadataTable schema
 */
export interface SyncMetadata {
  id: string;
  documentId: string;
  connectionId: string;
  externalId: string;
  lastSyncedAt: Date | null;
  lastSyncedHash: string | null; // Content hash for change detection
  syncStatus: "synced" | "pending" | "conflict" | "error";
  syncError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Generic resource (repository, collection, folder, etc.)
 */
export interface ExternalResource {
  id: string;
  name: string;
  fullName: string;
  metadata?: Record<string, any>;
}

/**
 * Extension that supports listing external resources
 * Examples: GitHub repositories, Shopify collections, Notion databases
 */
export interface ResourceExtension {
  /**
   * Fetch available resources for the authenticated user/connection
   * @param connection - The extension connection
   * @returns List of available resources
   */
  fetchResources(connection: ExtensionConnection): Promise<ExternalResource[]>;
}
