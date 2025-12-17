import type {
  IntegrationConnection,
  SyncDocument,
  PushOptions,
  PullOptions,
  SyncResult,
  SyncMetadata,
  DefaultLink,
} from "./types";

/**
 * Base interface that all sync integrations must implement
 */
export interface Integration {
  /**
   * Validate that the connection configuration is valid
   * This is called when a user sets up a new connection
   */
  validateConnection(connection: IntegrationConnection): Promise<{
    valid: boolean;
    error?: string;
  }>;

  /**
   * Push a document to the external platform
   * Called when a document is published
   */
  push(options: PushOptions): Promise<SyncResult>;

  /**
   * Pull documents from the external platform
   * Called during initial sync after connection setup
   */
  pull(options: PullOptions): Promise<SyncResult[]>;

  /**
   * Check if there are any conflicts before pushing
   * Returns conflict details if any are detected
   */
  checkConflicts?(
    document: SyncDocument,
    connection: IntegrationConnection
  ): Promise<{
    hasConflict: boolean;
    details?: SyncResult["conflictDetails"];
  }>;

  /**
   * Get metadata about the sync status of a document
   */
  getSyncMetadata?(
    documentId: string,
    connection: IntegrationConnection
  ): Promise<SyncMetadata | null>;

  /**
   * Called after a connection is successfully established
   * Can return default links to auto-create for this integration
   */
  onConnect?(): { links?: DefaultLink[] };
}

/**
 * Base class that provides common functionality for integrations
 * Integrations can extend this to avoid reimplementing common patterns
 */
export abstract class BaseIntegration implements Integration {
  abstract validateConnection(connection: IntegrationConnection): Promise<{
    valid: boolean;
    error?: string;
  }>;

  abstract push(options: PushOptions): Promise<SyncResult>;

  abstract pull(options: PullOptions): Promise<SyncResult[]>;

  /**
   * Helper method to create a success result
   */
  protected createSuccessResult(
    documentId: string,
    externalId?: string,
    message?: string
  ): SyncResult {
    return {
      success: true,
      documentId,
      externalId,
      message,
    };
  }

  /**
   * Helper method to create an error result
   */
  protected createErrorResult(
    documentId: string,
    error: string,
    conflictDetails?: SyncResult["conflictDetails"]
  ): SyncResult {
    return {
      success: false,
      documentId,
      error,
      conflictDetected: !!conflictDetails,
      conflictDetails,
    };
  }
}
