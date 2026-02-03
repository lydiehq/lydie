import { createId } from "@lydie/core/id";
import { slugify } from "@lydie/core/utils";
import { db, documentsTable } from "@lydie/database";
import { tool } from "ai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { processDocumentEmbedding } from "../../embedding/document-processing";
import { processDocumentTitleEmbedding } from "../../embedding/title-processing";
import { deserializeFromHTML } from "../../serialization/html";
import { convertJsonToYjs } from "../../yjs-to-json";

export const createDocument = (userId: string, organizationId: string) =>
  tool({
    description: `Create new documents in the workspace.

Supports hierarchies via parentId. Content must be provided at creation time in HTML format.

Use for: creating NEW separate documents (not adding content to existing ones).
Signal words: "create documents/pages/articles" (plural), "create 3/5/N items", "create one for X, Y, Z".`,
    inputSchema: z.object({
      title: z.string().describe("The title of the new document"),
      content: z
        .string()
        .optional()
        .describe("The initial content of the document in HTML format."),
      parentId: z
        .string()
        .optional()
        .describe("The ID of the parent document to create this document under (for nesting)."),
    }),
    execute: async ({ title, content, parentId }) => {
      try {
        // Verify parent existence if provided
        if (parentId) {
          const [parent] = await db
            .select()
            .from(documentsTable)
            .where(
              and(
                eq(documentsTable.id, parentId),
                eq(documentsTable.organizationId, organizationId),
              ),
            )
            .limit(1);

          if (!parent) {
            return {
              state: "error",
              error: `The parent document you're trying to create this under doesn't exist or you don't have access to it.`,
            };
          }
        }

        const id = createId();
        const slug = `${slugify(title)}-${createId().slice(0, 6)}`;

        // Prepare content
        let yjsState: string | null = null;
        if (content) {
          try {
            const jsonContent = deserializeFromHTML(content);
            yjsState = convertJsonToYjs(jsonContent);

            if (!yjsState) {
              throw new Error("Failed to convert content to Yjs format");
            }
          } catch (contentError: any) {
            console.error("Failed to parse content:", contentError);
            return {
              state: "error",
              error: `Failed to process document content: ${contentError.message || "Unknown error"}`,
            };
          }
        } else {
          const emptyContent = { type: "doc", content: [] };
          yjsState = convertJsonToYjs(emptyContent);
        }

        // Insert document into database
        await db.insert(documentsTable).values({
          id,
          title,
          slug,
          userId,
          organizationId,
          yjsState,
          parentId: parentId || null,
          published: false,
        });

        // Generate embeddings
        if (content) {
          processDocumentEmbedding(
            {
              documentId: id,
              yjsState,
            },
            db,
          ).catch((error) => {
            console.error(`Failed to generate embeddings for document ${id}:`, error);
          });
        } else {
          processDocumentTitleEmbedding(
            {
              documentId: id,
              title,
            },
            db,
          ).catch((error) => {
            console.error(`Failed to generate title embedding for document ${id}:`, error);
          });
        }

        return {
          state: "success",
          message: content
            ? `Document "${title}" created with content successfully.`
            : `Document "${title}" created successfully.`,
          document: {
            id,
            title,
            slug,
            parentId: parentId || undefined,
          },
          contentApplied: !!content,
        };
      } catch (error: any) {
        console.error("Failed to create document:", error);
        return {
          state: "error",
          error: `Something went wrong while creating the document. Please try again.`,
        };
      }
    },
  });
