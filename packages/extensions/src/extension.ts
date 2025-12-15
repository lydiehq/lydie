import type {
  ExtensionConnection,
  SyncDocument,
  PushOptions,
  PullOptions,
  SyncResult,
  SyncMetadata,
} from "./types";

/**
 * Base interface that all sync extensions must implement
 */
export interface SyncExtension {
  /**
   * Unique identifier for this extension type (e.g., "github", "shopify", "wordpress")
   */
  readonly type: string;

  /**
   * Human-readable name of the extension
   */
  readonly name: string;

  /**
   * Description of what this extension does
   */
  readonly description: string;

  /**
   * Validate that the connection configuration is valid
   * This is called when a user sets up a new connection
   */
  validateConnection(connection: ExtensionConnection): Promise<{
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
    connection: ExtensionConnection
  ): Promise<{
    hasConflict: boolean;
    details?: SyncResult["conflictDetails"];
  }>;

  /**
   * Get metadata about the sync status of a document
   */
  getSyncMetadata?(
    documentId: string,
    connection: ExtensionConnection
  ): Promise<SyncMetadata | null>;

  /**
   * Convert TipTap JSON to the format expected by the external platform
   * E.g., TipTap -> Markdown for GitHub
   */
  convertToExternalFormat(content: any): Promise<string>;

  /**
   * Convert from external format back to TipTap JSON
   * E.g., Markdown -> TipTap for GitHub
   */
  convertFromExternalFormat?(content: string): Promise<any>;
}

/**
 * Base class that provides common functionality for extensions
 * Extensions can extend this to avoid reimplementing common patterns
 */
export abstract class BaseSyncExtension implements SyncExtension {
  abstract readonly type: string;
  abstract readonly name: string;
  abstract readonly description: string;

  abstract validateConnection(connection: ExtensionConnection): Promise<{
    valid: boolean;
    error?: string;
  }>;

  abstract push(options: PushOptions): Promise<SyncResult>;

  abstract convertToExternalFormat(content: any): Promise<string>;

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
