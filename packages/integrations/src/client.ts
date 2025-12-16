/**
 * @lydie/integrations/client
 *
 * Client-safe exports for the integrations package.
 * This module only exports code that can be safely used in browser/SPA contexts
 * without pulling in server-side dependencies.
 */

// Export only client-safe metadata and types
export * from "./metadata";
export type {
  IntegrationConnection,
  SyncDocument,
  SyncResult,
  SyncMetadata,
  ExternalResource,
} from "./types";

