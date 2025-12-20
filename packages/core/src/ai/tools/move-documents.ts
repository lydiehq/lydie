import { tool } from "ai";
import { z } from "zod";
import { db, documentsTable, foldersTable } from "@lydie/database";
import { eq, and, isNull, inArray } from "drizzle-orm";

export const moveDocuments = (userId: string, organizationId: string) =>
  tool({
    description: `Move one or more documents to a folder (or to root level if no folder specified).
Use this tool when the user asks to move documents, organize documents into folders, or rearrange their workspace.
You can move documents by their IDs or by searching for documents matching certain criteria.`,
    inputSchema: z.object({
      documentIds: z
        .array(z.string())
        .describe(
          "Array of document IDs to move. Use the listDocuments tool first to get document IDs if needed. Not required if moveAll is true."
        )
        .optional()
        .default([]),
      folderId: z
        .string()
        .describe(
          "ID of the destination folder. Leave empty or set to null to move documents to root level."
        )
        .optional()
        .nullable(),
      folderName: z
        .string()
        .describe(
          "Name of the destination folder. Will search for existing folder by name. Use this if you don't have the folder ID."
        )
        .optional(),
      moveAll: z
        .boolean()
        .describe(
          "If true, move all documents in the workspace to the specified folder. Overrides documentIds."
        )
        .default(false),
    }),
    execute: async function* ({
      documentIds = [],
      folderId,
      folderName,
      moveAll = false,
    }) {
      // Yield initial moving state
      yield {
        state: "moving",
        message: moveAll
          ? `Moving all documents...`
          : `Moving ${documentIds.length} document${
              documentIds.length === 1 ? "" : "s"
            }...`,
      };

      // Resolve destination folder
      let resolvedFolderId: string | null = null;

      if (folderId) {
        // Verify folder exists and user has access
        const [folder] = await db
          .select()
          .from(foldersTable)
          .where(
            and(
              eq(foldersTable.id, folderId),
              eq(foldersTable.organizationId, organizationId),
              isNull(foldersTable.deletedAt)
            )
          )
          .limit(1);

        if (!folder) {
          yield {
            state: "error",
            error: `Folder with ID "${folderId}" not found or you don't have access to it`,
          };
          return;
        }

        resolvedFolderId = folderId;
      } else if (folderName) {
        // Search for folder by name (check root level first)
        const [folder] = await db
          .select()
          .from(foldersTable)
          .where(
            and(
              eq(foldersTable.name, folderName),
              eq(foldersTable.organizationId, organizationId),
              isNull(foldersTable.deletedAt),
              isNull(foldersTable.parentId) // Root level folder
            )
          )
          .limit(1);

        if (!folder) {
          yield {
            state: "error",
            error: `Folder "${folderName}" not found at root level`,
          };
          return;
        }

        resolvedFolderId = folder.id;
      }

      // Get documents to move
      let documentsToMove: any[] = [];

      if (moveAll) {
        // Get all documents for the user/organization
        documentsToMove = await db
          .select({
            id: documentsTable.id,
            title: documentsTable.title,
            folderId: documentsTable.folderId,
          })
          .from(documentsTable)
          .where(
            and(
              eq(documentsTable.organizationId, organizationId),
              isNull(documentsTable.deletedAt)
            )
          );
      } else {
        if (documentIds.length === 0) {
          yield {
            state: "error",
            error: "Either provide documentIds or set moveAll to true",
          };
          return;
        }
        // Get specific documents
        documentsToMove = await db
          .select({
            id: documentsTable.id,
            title: documentsTable.title,
            folderId: documentsTable.folderId,
          })
          .from(documentsTable)
          .where(
            and(
              eq(documentsTable.organizationId, organizationId),
              inArray(documentsTable.id, documentIds),
              isNull(documentsTable.deletedAt)
            )
          );
      }

      if (documentsToMove.length === 0) {
        yield {
          state: "error",
          error: "No documents found to move",
        };
        return;
      }

      // Update documents
      const updatedDocuments = await db
        .update(documentsTable)
        .set({
          folderId: resolvedFolderId,
        })
        .where(
          and(
            eq(documentsTable.organizationId, organizationId),
            inArray(
              documentsTable.id,
              documentsToMove.map((d) => d.id)
            ),
            isNull(documentsTable.deletedAt)
          )
        )
        .returning({
          id: documentsTable.id,
          title: documentsTable.title,
          folderId: documentsTable.folderId,
        });

      const folderInfo = resolvedFolderId
        ? `folder "${folderName || folderId}"`
        : "root level";

      // Yield final success state
      yield {
        state: "success",
        message: `Successfully moved ${updatedDocuments.length} document${
          updatedDocuments.length === 1 ? "" : "s"
        } to ${folderInfo}`,
        movedDocuments: updatedDocuments.map((doc) => ({
          id: doc.id,
          title: doc.title,
          folderId: doc.folderId,
        })),
        totalMoved: updatedDocuments.length,
      };
    },
  });
