import { tool } from "ai";
import { z } from "zod";
import { db, documentsTable } from "@lydie/database";
import { eq, and, isNull, inArray } from "drizzle-orm";

export const moveDocuments = (userId: string, organizationId: string) =>
  tool({
    description: `Move one or more documents to be children of another document (or to root level if no parent specified).
Use this tool when the user asks to move documents, organize documents into pages, or rearrange their workspace.
You can move documents by their IDs or by searching for documents matching certain criteria.`,
    inputSchema: z.object({
      documentIds: z
        .array(z.string())
        .describe(
          "Array of document IDs to move. Use the listDocuments tool first to get document IDs if needed. Not required if moveAll is true."
        )
        .optional()
        .default([]),
      parentId: z
        .string()
        .describe(
          "ID of the destination parent document. Leave empty or set to null to move documents to root level."
        )
        .optional()
        .nullable(),
      parentTitle: z
        .string()
        .describe(
          "Title of the destination parent document. Will search for existing document by title. Use this if you don't have the document ID."
        )
        .optional(),
      moveAll: z
        .boolean()
        .describe(
          "If true, move all documents in the workspace to the specified parent. Overrides documentIds."
        )
        .default(false),
    }),
    execute: async function* ({
      documentIds = [],
      parentId,
      parentTitle,
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

      // Resolve destination parent document
      let resolvedParentId: string | null = null;

      if (parentId) {
        // Verify parent document exists and user has access
        const parent = await db.query.documentsTable.findFirst({
          where: and(
            eq(documentsTable.id, parentId),
            eq(documentsTable.organizationId, organizationId),
            isNull(documentsTable.deletedAt)
          ),
        });

        if (!parent) {
          yield {
            state: "error",
            error: `Parent document with ID "${parentId}" not found or you don't have access to it`,
          };
          return;
        }

        // Check for circular reference
        if (documentIds.includes(parentId)) {
          yield {
            state: "error",
            error: "Cannot move a document into itself",
          };
          return;
        }

        resolvedParentId = parentId;
      } else if (parentTitle) {
        // Search for parent document by title (check root level first)
        const parent = await db.query.documentsTable.findFirst({
          where: and(
            eq(documentsTable.title, parentTitle),
            eq(documentsTable.organizationId, organizationId),
            isNull(documentsTable.deletedAt),
            isNull(documentsTable.parentId) // Root level document
          ),
        });

        if (!parent) {
          yield {
            state: "error",
            error: `Parent document "${parentTitle}" not found at root level`,
          };
          return;
        }

        resolvedParentId = parent.id;
      }

      // Get documents to move
      let documentsToMove: any[] = [];

      if (moveAll) {
        // Get all documents for the user/organization
        documentsToMove = await db
          .select({
            id: documentsTable.id,
            title: documentsTable.title,
            parentId: documentsTable.parentId,
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
            parentId: documentsTable.parentId,
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

      // Check for circular references
      if (resolvedParentId) {
        for (const doc of documentsToMove) {
          // Check if parent is a descendant of any document being moved
          let currentParentId: string | null = resolvedParentId;
          while (currentParentId) {
            if (documentIds.includes(currentParentId)) {
              yield {
                state: "error",
                error: "Cannot move documents into their own descendants",
              };
              return;
            }
            const parentDoc = await db.query.documentsTable.findFirst({
              where: eq(documentsTable.id, currentParentId),
            });
            currentParentId = parentDoc?.parentId ?? null;
          }
        }
      }

      // Update documents
      const updatedDocuments = await db
        .update(documentsTable)
        .set({
          parentId: resolvedParentId,
          updatedAt: new Date(),
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
          parentId: documentsTable.parentId,
        });

      const parentInfo = resolvedParentId
        ? `parent document "${parentTitle || parentId}"`
        : "root level";

      // Yield final success state
      yield {
        state: "success",
        message: `Successfully moved ${updatedDocuments.length} document${
          updatedDocuments.length === 1 ? "" : "s"
        } to ${parentInfo}`,
        movedDocuments: updatedDocuments.map((doc) => ({
          id: doc.id,
          title: doc.title,
          parentId: doc.parentId,
        })),
        totalMoved: updatedDocuments.length,
      };
    },
  });
