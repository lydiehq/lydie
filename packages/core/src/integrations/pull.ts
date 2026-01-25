import { processDocumentEmbedding } from "@lydie/core/embedding/document-processing";
import { createId } from "@lydie/core/id";
import { convertJsonToYjs } from "@lydie/core/yjs-to-json";
import { db } from "@lydie/database";
import {
  documentsTable,
  integrationConnectionsTable,
  integrationLinksTable,
} from "@lydie/database";
import { and, eq } from "drizzle-orm";

import type { Integration } from "./types";

export interface PullFromLinkOptions {
  linkId: string;
  organizationId: string;
  userId: string;
  integration: Integration;
}

export interface PullFromLinkResult {
  success: boolean;
  imported: number;
  failed: number;
  error?: string;
}

// Pull documents from an integration link
// This function encapsulates the business logic for:
// - Fetching the link and connection
// - Refreshing tokens if needed
// - Calling integration.pull()
// - Creating documents from results
// - Updating link sync timestamp
// - Updating connection status
export async function pullFromIntegrationLink(
  options: PullFromLinkOptions,
): Promise<PullFromLinkResult> {
  const { linkId, organizationId, userId, integration } = options;

  try {
    console.log(`[Integration Pull] Starting pull for link ${linkId}`);

    // Fetch link with its connection
    const link = await db.query.integrationLinksTable.findFirst({
      where: { id: linkId },
      with: {
        connection: true,
      },
    });

    if (!link || link.organizationId !== organizationId) {
      console.error(`[Integration Pull] Link not found or access denied: ${linkId}`);
      return {
        success: false,
        imported: 0,
        failed: 0,
        error: "Link not found",
      };
    }

    const connection = link.connection;
    if (!connection) {
      return {
        success: false,
        imported: 0,
        failed: 0,
        error: "Connection not found",
      };
    }

    console.log(`[Integration Pull] Pulling from ${connection.integrationType} link: ${link.name}`);

    // Merge connection config with link config for the pull
    // Link config contains path-specific info (e.g., repo path)
    const mergedConfig = {
      ...(connection.config as Record<string, any>),
      ...(link.config as Record<string, any>),
    };

    // Create a connection object for token refresh
    const connectionForRefresh = {
      id: connection.id,
      integrationType: connection.integrationType,
      organizationId: connection.organizationId,
      config: mergedConfig,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };

    // Refresh access token if needed (for GitHub Apps with expiring tokens)
    if ("getAccessToken" in integration && typeof integration.getAccessToken === "function") {
      try {
        const oldToken = (mergedConfig as any).installationAccessToken;
        await integration.getAccessToken(connectionForRefresh);
        const newToken = (mergedConfig as any).installationAccessToken;

        // Update database if token was refreshed
        if (oldToken !== newToken) {
          console.log(`[Integration Pull] Token refreshed for connection ${connection.id}`);
          await db
            .update(integrationConnectionsTable)
            .set({
              config: connection.config,
              updatedAt: new Date(),
            })
            .where(eq(integrationConnectionsTable.id, connection.id));
        }
      } catch (error) {
        console.error(
          `[Integration Pull] Failed to refresh token for connection ${connection.id}:`,
          error,
        );
        // Continue anyway - the getAccessToken in the integration will handle errors
      }
    }

    // Call integration's pull method
    const results = await integration.pull({
      connection: connectionForRefresh,
      organizationId,
      userId,
    });

    let imported = 0;
    let failed = 0;

    // Build a map of external IDs to document IDs for parent resolution
    const externalIdToDocId = new Map<string, string>();

    // First pass: create/update all documents (including locked folder pages)
    for (const result of results) {
      if (result.success && result.metadata) {
        try {
          const isLocked = result.metadata.isLocked ?? false;
          const customFields = result.metadata.customFields as
            | Record<string, string | number>
            | undefined;

          // Check if document already exists by externalId
          let existingDocument = null;
          if (result.externalId) {
            const docs = await db
              .select()
              .from(documentsTable)
              .where(
                and(
                  eq(documentsTable.externalId, result.externalId),
                  eq(documentsTable.integrationLinkId, link.id),
                ),
              )
              .limit(1);
            existingDocument = docs[0] || null;
          }

          let insertedDocument;
          let documentId: string;

          if (existingDocument) {
            // Update existing document
            documentId = existingDocument.id;

            // Convert TipTap JSON to Yjs format
            const yjsState = convertJsonToYjs(result.metadata.content);

            await db
              .update(documentsTable)
              .set({
                title: result.metadata.title,
                slug: result.metadata.slug,
                yjsState: yjsState,
                customFields: customFields || null,
                isLocked,
                updatedAt: new Date(),
                deletedAt: null, // Ensure document is not marked as deleted
              })
              .where(eq(documentsTable.id, existingDocument.id));

            // Fetch the updated document
            insertedDocument = await db.query.documentsTable.findFirst({
              where: {
                id: existingDocument.id,
              },
            });
          } else {
            // Insert new document
            documentId = createId();

            // Convert TipTap JSON to Yjs format
            const yjsState = convertJsonToYjs(result.metadata.content);

            await db.insert(documentsTable).values({
              id: documentId,
              title: result.metadata.title,
              slug: result.metadata.slug,
              yjsState: yjsState,
              userId: userId,
              organizationId,
              integrationLinkId: link.id,
              externalId: result.externalId ?? null,
              customFields: customFields || null,
              isLocked,
              published: true, // Documents from integrations are published by default
              createdAt: new Date(),
              updatedAt: new Date(),
            });

            // Fetch the newly inserted document
            insertedDocument = await db.query.documentsTable.findFirst({
              where: {
                id: documentId,
              },
            });
          }

          // Store in map for parent resolution
          if (result.externalId) {
            externalIdToDocId.set(result.externalId, documentId);
          }

          if (insertedDocument && insertedDocument.yjsState) {
            processDocumentEmbedding(
              {
                documentId: insertedDocument.id,
                yjsState: insertedDocument.yjsState,
                title: insertedDocument.title,
              },
              db,
            ).catch((error) => {
              console.error(
                `[Integration Pull] Failed to generate embeddings for document ${insertedDocument.id} (${result.externalId}):`,
                error,
              );
            });
          }

          imported++;
        } catch (error) {
          failed++;
          console.error(
            `[Integration Pull] Failed to create/update document from ${result.externalId}:`,
            error,
          );
        }
      } else {
        failed++;
        console.error(`[Integration Pull] Pull failed: ${result.error}`);
      }
    }

    // Second pass: set parent relationships based on externalId paths
    // For files: externalId is the file path (e.g., "docs/guide.md")
    // For folders: externalId is "__folder__<path>" (e.g., "__folder__docs")
    // Parent is determined by the directory containing the file/folder
    console.log("[Integration Pull] Setting parent relationships...");
    for (const result of results) {
      if (!result.success || !result.metadata || !result.externalId) continue;

      // Determine parent path from externalId
      let parentPath: string | null = null;

      if (result.externalId.startsWith("__folder__")) {
        // For folder pages, parent is the parent directory
        const folderPath = result.externalId.substring("__folder__".length);
        const pathParts = folderPath.split("/");
        if (pathParts.length > 1) {
          pathParts.pop(); // Remove last segment
          parentPath = pathParts.join("/");
        }
      } else {
        // For regular files, parent is the containing directory
        const pathParts = result.externalId.split("/");
        if (pathParts.length > 1) {
          pathParts.pop(); // Remove filename
          parentPath = pathParts.join("/");
        }
      }

      // If we have a parent path, find the corresponding folder document
      if (parentPath) {
        const parentExternalId = `__folder__${parentPath}`;
        const parentDocId = externalIdToDocId.get(parentExternalId);

        if (parentDocId) {
          const docId = externalIdToDocId.get(result.externalId);
          if (docId) {
            try {
              await db
                .update(documentsTable)
                .set({
                  parentId: parentDocId,
                  updatedAt: new Date(),
                })
                .where(eq(documentsTable.id, docId));

              console.log(
                `[Integration Pull] Set parent for ${result.externalId} -> ${parentPath}`,
              );
            } catch (error) {
              console.error(
                `[Integration Pull] Failed to set parent for ${result.externalId}:`,
                error,
              );
            }
          }
        }
      }
    }

    // Update last synced timestamp
    await db
      .update(integrationLinksTable)
      .set({
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(integrationLinksTable.id, linkId));

    console.log(`[Integration Pull] Complete. Imported: ${imported}, Failed: ${failed}`);

    // If pull succeeded, ensure connection status is active
    if (connection.status !== "active") {
      await db
        .update(integrationConnectionsTable)
        .set({
          status: "active",
          statusMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(integrationConnectionsTable.id, connection.id));
    }

    return { success: true, imported, failed };
  } catch (error) {
    console.error("[Integration Pull] Error during pull:", error);
    console.error(
      "[Integration Pull] Error stack:",
      error instanceof Error ? error.stack : "No stack",
    );

    // Update connection status to error if pull failed
    try {
      // Get the link and connection to update status
      const linkRow = await db
        .select()
        .from(integrationLinksTable)
        .where(eq(integrationLinksTable.id, linkId))
        .limit(1);

      if (linkRow[0]) {
        await db
          .update(integrationConnectionsTable)
          .set({
            status: "error",
            statusMessage: error instanceof Error ? error.message : "Pull failed",
            updatedAt: new Date(),
          })
          .where(eq(integrationConnectionsTable.id, linkRow[0].connectionId));
      }
    } catch (updateError) {
      console.error("[Integration Pull] Failed to update connection status:", updateError);
    }

    return {
      success: false,
      imported: 0,
      failed: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
