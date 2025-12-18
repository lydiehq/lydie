import type {
  IntegrationConnection,
  PushOptions,
  PullOptions,
  SyncResult,
  DefaultLink,
} from "./types";

/**
 * Base class that provides common functionality for integrations
 * Integrations can extend this to avoid reimplementing common patterns
 */
export abstract class BaseIntegration {
  abstract validateConnection(connection: IntegrationConnection): Promise<{
    valid: boolean;
    error?: string;
  }>;
  abstract push(options: PushOptions): Promise<SyncResult>;
  abstract pull(options: PullOptions): Promise<SyncResult[]>;

  /**
   * Called after a connection is successfully established
   * Can return default links to auto-create for this integration
   * Optional - subclasses can override this method
   */
  onConnect?(): { links?: DefaultLink[] };

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
