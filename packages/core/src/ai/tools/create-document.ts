import { tool } from "ai";
import { z } from "zod";
import { db, documentsTable } from "@lydie/database";
import { createId } from "@lydie/core/id";
import { slugify } from "@lydie/core/utils";
import { convertJsonToYjs } from "../../yjs-to-json";
import { deserializeFromHTML } from "../../serialization/html";
import { eq, and } from "drizzle-orm";
import { processDocumentEmbedding } from "../../embedding/document-processing";
import { processDocumentTitleEmbedding } from "../../embedding/title-processing";

export const createDocument = (userId: string, organizationId: string) =>
  tool({
    description: `Create a new document in the knowledge base.
Use this tool when the user wants to create a new document.
You can create a hierarchy of documents by specifying a parentId.
You can also optionally provide initial content in HTML format.

Examples: "Create a new document about X", "Write a summary of these documents in a new file"`,
    inputSchema: z.object({
      title: z.string().describe("The title of the new document"),
      content: z
        .string()
        .optional()
        .describe(
          "The initial content of the document in HTML format. Use HTML tags like <p>, <h2>, <ul>, etc."
        ),
      parentId: z
        .string()
        .optional()
        .describe(
          "The ID of the parent document to create this document under (for nesting)."
        ),
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
                eq(documentsTable.organizationId, organizationId)
              )
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
        let yjsState;
        if (content) {
          try {
            const jsonContent = deserializeFromHTML(content);
            yjsState = convertJsonToYjs(jsonContent);
          } catch (contentError: any) {
            console.error("Failed to parse content:", contentError);
            // Create document with empty content if parsing fails
            const emptyContent = { type: "doc", content: [] };
            yjsState = convertJsonToYjs(emptyContent);
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
          indexStatus: "pending",
          published: false,
        });

        // Generate embeddings
        if (content) {
          processDocumentEmbedding(
            {
              documentId: id,
              yjsState,
            },
            db
          ).catch((error) => {
            console.error(
              `Failed to generate embeddings for document ${id}:`,
              error
            );
          });
        } else {
          processDocumentTitleEmbedding(
            {
              documentId: id,
              title,
            },
            db
          ).catch((error) => {
            console.error(
              `Failed to generate title embedding for document ${id}:`,
              error
            );
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
