import { db } from "@lydie/database";
import { documentsTable, integrationConnectionsTable } from "@lydie/database";
import { eq } from "drizzle-orm";

import { convertYjsToJson } from "../yjs-to-json";
import type { Integration, SyncDocument } from "./types";
import { validateCustomFields } from "./validation";

export interface PushDocumentOptions {
  documentId: string;
  organizationId: string;
  integration?: Integration; // Optional if caller already has it
}

export interface PushDocumentResult {
  success: boolean;
  externalId?: string;
  message?: string;
  error?: string;
}

// Push a document to its integration platform
// This function encapsulates the business logic for:
// - Fetching the document and its integration link
// - Validating custom fields against integration schema
// - Calling integration.push()
// - Updating document status
export async function pushDocumentToIntegration(
  options: PushDocumentOptions,
): Promise<PushDocumentResult> {
  const { documentId, organizationId, integration: providedIntegration } = options;

  try {
    console.log(`[Integration Push] Starting push for document ${documentId}`);

    const document = await db.query.documentsTable.findFirst({
      where: { id: documentId },
      with: {
        integrationLink: {
          with: {
            connection: true,
          },
        },
      },
    });

    if (!document || document.organizationId !== organizationId) {
      return {
        success: false,
        error: "Document not found or access denied",
      };
    }

    if (!document.integrationLinkId || !document.integrationLink) {
      return {
        success: false,
        error: "Document is not linked to an integration",
      };
    }

    const link = document.integrationLink;
    const connection = link.connection;

    if (!connection) {
      return {
        success: false,
        error: "Integration connection not found",
      };
    }

    const integration = providedIntegration;
    if (!integration) {
      return {
        success: false,
        error: "Integration not available",
      };
    }

    console.log(`[Integration Push] Pushing to ${connection.integrationType}: ${document.title}`);

    const schema = integration.getCustomFieldSchema?.();
    const validation = validateCustomFields(
      document.customFields as Record<string, string | number> | undefined,
      schema,
    );

    if (!validation.valid) {
      const errorMessage = `Custom field validation failed: ${validation.errors.join(", ")}`;
      console.error(`[Integration Push] ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
      };
    }

    const mergedConfig = {
      ...(connection.config as Record<string, any>),
      ...(link.config as Record<string, any>),
    };

    const jsonContent = convertYjsToJson(document.yjsState);

    const parentPathSegments: string[] = [];
    if (document.parentId) {
      let currentParentId: string | null = document.parentId;
      const visited = new Set<string>(); // Prevent infinite loops

      while (currentParentId && !visited.has(currentParentId)) {
        visited.add(currentParentId);
        const parent = await db.query.documentsTable.findFirst({
          where: { id: currentParentId },
        });

        if (!parent) break;

        if (parent.externalId?.startsWith("__folder__")) {
          const folderPath = parent.externalId.substring("__folder__".length);
          const folderName = folderPath.split("/").pop() || folderPath;
          parentPathSegments.unshift(folderName); // Add to beginning (we're going up the tree)
        } else {
          // For regular parent documents, use title
          // This shouldn't happen in practice for synced documents, but handle it gracefully
          parentPathSegments.unshift(parent.title);
        }

        currentParentId = parent.parentId;
      }
    }

    const syncDocument: SyncDocument = {
      id: document.id,
      title: document.title,
      slug: document.slug,
      content: jsonContent,
      published: document.published,
      updatedAt: document.updatedAt,
      organizationId: document.organizationId,
      externalId: document.externalId,
      parentId: document.parentId,
      parentPathSegments: parentPathSegments.length > 0 ? parentPathSegments : undefined,
      customFields: document.customFields as Record<string, string | number> | undefined,
    };

    const result = await integration.push({
      document: syncDocument,
      connection: {
        id: connection.id,
        integrationType: connection.integrationType,
        organizationId: connection.organizationId,
        config: mergedConfig,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
      },
    });

    if (result.success) {
      if (result.externalId) {
        await db
          .update(documentsTable)
          .set({
            externalId: result.externalId,
            updatedAt: new Date(),
          })
          .where(eq(documentsTable.id, documentId));
      }

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

      console.log(
        `[Integration Push] Successfully pushed document ${documentId} to ${connection.integrationType}`,
      );
    } else {
      console.error(`[Integration Push] Failed to push document ${documentId}: ${result.error}`);
    }

    return result;
  } catch (error) {
    console.error("[Integration Push] Error during push:", error);
    console.error(
      "[Integration Push] Error stack:",
      error instanceof Error ? error.stack : "No stack",
    );

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
