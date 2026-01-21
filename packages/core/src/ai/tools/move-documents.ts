import { tool } from "ai"
import { z } from "zod"
import { db, documentsTable } from "@lydie/database"
import { eq, and, isNull, inArray } from "drizzle-orm"

type DocumentToMove = { id: string; title: string; parentId: string | null }

export const moveDocuments = (userId: string, organizationId: string) =>
  tool({
    description: `Move one or more documents to be children of another document (or to root level if no parent specified).
Use this tool when the user asks to move documents or rearrange their workspace.
You can move documents by their IDs or by searching for documents matching certain criteria.`,
    inputSchema: z.object({
      documentIds: z
        .array(z.string())
        .describe(
          "Array of document IDs to move. Use the listDocuments tool first to get document IDs if needed. Not required if moveAll is true.",
        )
        .default([]),
      parentId: z
        .string()
        .describe(
          "ID of the destination parent document. Leave empty or set to null to move documents to root level.",
        )
        .optional()
        .nullable(),
      parentTitle: z
        .string()
        .describe(
          "Title of the destination parent document. Will search for existing document by title. Use this if you don't have the document ID.",
        )
        .optional(),
      moveAll: z
        .boolean()
        .describe(
          "If true, move all documents in the workspace to the specified parent. Overrides documentIds.",
        )
        .default(false),
    }),
    execute: async function* ({ documentIds, parentId, parentTitle, moveAll }) {
      yield {
        state: "moving",
        message: moveAll
          ? `Moving all documents...`
          : `Moving ${documentIds.length} document${documentIds.length === 1 ? "" : "s"}...`,
      }

      // Resolve destination parent document
      let resolvedParentId: string | null = null
      let parentDisplayName = "root level"

      if (parentId) {
        const [parent] = await db
          .select({ id: documentsTable.id, title: documentsTable.title })
          .from(documentsTable)
          .where(
            and(
              eq(documentsTable.id, parentId),
              eq(documentsTable.organizationId, organizationId),
              isNull(documentsTable.deletedAt),
            ),
          )
          .limit(1)

        if (!parent) {
          yield {
            state: "error",
            error: `Parent document with ID "${parentId}" not found or you don't have access to it`,
          }
          return
        }

        resolvedParentId = parentId
        parentDisplayName = `"${parent.title}"`
      } else if (parentTitle) {
        const [parent] = await db
          .select({ id: documentsTable.id })
          .from(documentsTable)
          .where(
            and(
              eq(documentsTable.title, parentTitle),
              eq(documentsTable.organizationId, organizationId),
              isNull(documentsTable.deletedAt),
              isNull(documentsTable.parentId),
            ),
          )
          .limit(1)

        if (!parent) {
          yield {
            state: "error",
            error: `Parent document "${parentTitle}" not found at root level`,
          }
          return
        }

        resolvedParentId = parent.id
        parentDisplayName = `"${parentTitle}"`
      }

      // Get documents to move
      const baseConditions = [
        eq(documentsTable.organizationId, organizationId),
        isNull(documentsTable.deletedAt),
      ]

      const documentsToMove: DocumentToMove[] = moveAll
        ? await db
            .select({
              id: documentsTable.id,
              title: documentsTable.title,
              parentId: documentsTable.parentId,
            })
            .from(documentsTable)
            .where(and(...baseConditions))
        : documentIds.length > 0
          ? await db
              .select({
                id: documentsTable.id,
                title: documentsTable.title,
                parentId: documentsTable.parentId,
              })
              .from(documentsTable)
              .where(and(...baseConditions, inArray(documentsTable.id, documentIds)))
          : []

      if (documentsToMove.length === 0) {
        yield {
          state: "error",
          error: moveAll ? "No documents found to move" : "Either provide documentIds or set moveAll to true",
        }
        return
      }

      // Check for circular references by walking up from the target parent
      if (resolvedParentId) {
        const idsBeingMoved = new Set(documentsToMove.map((d) => d.id))

        if (idsBeingMoved.has(resolvedParentId)) {
          yield {
            state: "error",
            error: "Cannot move a document into itself",
          }
          return
        }

        // Walk up the ancestor chain to check if any ancestor is being moved
        let currentId: string | null = resolvedParentId
        while (currentId) {
          const [parent] = await db
            .select({ parentId: documentsTable.parentId })
            .from(documentsTable)
            .where(eq(documentsTable.id, currentId))
            .limit(1)

          currentId = parent?.parentId ?? null

          if (currentId && idsBeingMoved.has(currentId)) {
            yield {
              state: "error",
              error: "Cannot move documents into their own descendants",
            }
            return
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
              documentsToMove.map((d) => d.id),
            ),
            isNull(documentsTable.deletedAt),
          ),
        )
        .returning({
          id: documentsTable.id,
          title: documentsTable.title,
          parentId: documentsTable.parentId,
        })

      yield {
        state: "success",
        message: `Successfully moved ${updatedDocuments.length} document${
          updatedDocuments.length === 1 ? "" : "s"
        } to ${parentDisplayName}`,
        movedDocuments: updatedDocuments,
        totalMoved: updatedDocuments.length,
      }
    },
  })
