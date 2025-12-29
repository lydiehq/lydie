import { db } from "@lydie/database";
import {
  integrationConnectionsTable,
  integrationLinksTable,
  documentsTable,
  foldersTable,
} from "@lydie/database";
import { eq, and, isNull } from "drizzle-orm";
import { createId } from "@lydie/core/id";
import { processDocumentEmbedding } from "@lydie/core/embedding/document-processing";
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

/**
 * Pull documents from an integration link
 * This function encapsulates the business logic for:
 * - Fetching the link and connection
 * - Refreshing tokens if needed
 * - Calling integration.pull()
 * - Creating documents and folders from results
 * - Updating link sync timestamp
 * - Updating connection status
 */
export async function pullFromIntegrationLink(
  options: PullFromLinkOptions
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
      console.error(
        `[Integration Pull] Link not found or access denied: ${linkId}`
      );
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

    console.log(
      `[Integration Pull] Pulling from ${connection.integrationType} link: ${link.name}`
    );

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
    if (
      "getAccessToken" in integration &&
      typeof integration.getAccessToken === "function"
    ) {
      try {
        const oldToken = (mergedConfig as any).installationAccessToken;
        await integration.getAccessToken(connectionForRefresh);
        const newToken = (mergedConfig as any).installationAccessToken;

        // Update database if token was refreshed
        if (oldToken !== newToken) {
          console.log(
            `[Integration Pull] Token refreshed for connection ${connection.id}`
          );
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
          error
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

    // Helper function to get or create folder by path
    const getOrCreateFolderByPath = async (
      folderPath: string | null | undefined
    ): Promise<string | undefined> => {
      if (!folderPath || folderPath.trim() === "" || folderPath === "/") {
        return undefined; // Root level
      }

      // Normalize path: remove leading/trailing slashes and split
      const parts = folderPath
        .replace(/^\/+|\/+$/g, "")
        .split("/")
        .filter((part) => part.length > 0);

      if (parts.length === 0) {
        return undefined;
      }

      let currentParentId: string | undefined = undefined;

      // Traverse the path, creating folders as needed
      for (const folderName of parts) {
        // Check if folder already exists with this name, parent, and organization
        const [existingFolder] = await db
          .select()
          .from(foldersTable)
          .where(
            and(
              eq(foldersTable.name, folderName),
              eq(foldersTable.organizationId, organizationId),
              eq(foldersTable.integrationLinkId, linkId),
              isNull(foldersTable.deletedAt),
              currentParentId
                ? eq(foldersTable.parentId, currentParentId)
                : isNull(foldersTable.parentId)
            )
          )
          .limit(1);

        if (existingFolder) {
          // Reuse existing folder
          currentParentId = existingFolder.id;
        } else {
          // Create new folder
          const newFolderId = createId();
          await db.insert(foldersTable).values({
            id: newFolderId,
            name: folderName,
            userId: userId,
            organizationId,
            parentId: currentParentId || null,
            integrationLinkId: linkId,
          });
          currentParentId = newFolderId;
        }
      }

      return currentParentId;
    };

    // Create documents from pull results
    for (const result of results) {
      if (result.success && result.metadata) {
        try {
          // Get or create folder if folderPath is provided
          const folderPath = result.metadata.folderPath as
            | string
            | null
            | undefined;
          const folderId = await getOrCreateFolderByPath(folderPath);

          // Check if document already exists (using the partial unique index criteria)
          const existingDocument = await db.query.documentsTable.findFirst({
            where: {
              organizationId: organizationId,
              integrationLinkId: link.id,
              slug: result.metadata.slug,
              deletedAt: undefined,
            },
          });

          let insertedDocument;

          if (existingDocument) {
            // Update existing document
            const customFields = result.metadata.customFields as
              | Record<string, string | number>
              | undefined;
            await db
              .update(documentsTable)
              .set({
                title: result.metadata.title,
                jsonContent: result.metadata.content,
                folderId: folderId || null,
                externalId: result.externalId ?? null,
                customFields: customFields || null,
                indexStatus: "pending", // Re-index when content changes
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
            const documentId = createId();
            const customFields = result.metadata.customFields as
              | Record<string, string | number>
              | undefined;
            await db.insert(documentsTable).values({
              id: documentId,
              title: result.metadata.title,
              slug: result.metadata.slug,
              jsonContent: result.metadata.content,
              userId: userId,
              organizationId,
              folderId: folderId || null, // Use created folder or null for root
              integrationLinkId: link.id,
              externalId: result.externalId ?? null,
              customFields: customFields || null,
              indexStatus: "pending",
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

          if (insertedDocument) {
            // Generate embeddings for the imported/updated document asynchronously (don't block)
            processDocumentEmbedding(insertedDocument, db)
              .then(() => {
                console.log(
                  `[Integration Pull] Successfully generated embeddings for document ${insertedDocument.id} (${result.externalId})`
                );
              })
              .catch((error) => {
                console.error(
                  `[Integration Pull] Failed to generate embeddings for document ${insertedDocument.id} (${result.externalId}):`,
                  error
                );
              });
          } else {
            console.warn(
              `[Integration Pull] Could not find document after upsert for ${result.externalId}`
            );
          }

          imported++;
          console.log(
            `[Integration Pull] Imported/Updated: ${result.externalId}${
              folderPath ? ` (folder: ${folderPath})` : ""
            }`
          );
        } catch (error) {
          failed++;
          console.error(
            `[Integration Pull] Failed to create/update document from ${result.externalId}:`,
            error
          );
        }
      } else {
        failed++;
        console.error(`[Integration Pull] Pull failed: ${result.error}`);
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

    console.log(
      `[Integration Pull] Complete. Imported: ${imported}, Failed: ${failed}`
    );

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
      error instanceof Error ? error.stack : "No stack"
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
            statusMessage:
              error instanceof Error ? error.message : "Pull failed",
            updatedAt: new Date(),
          })
          .where(eq(integrationConnectionsTable.id, linkRow[0].connectionId));
      }
    } catch (updateError) {
      console.error(
        "[Integration Pull] Failed to update connection status:",
        updateError
      );
    }

    return {
      success: false,
      imported: 0,
      failed: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
