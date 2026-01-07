import { tool } from "ai";
import { z } from "zod";
import { db, documentsTable } from "@lydie/database";
import { createId } from "@lydie/core/id";
import { slugify } from "@lydie/core/utils";
import { convertJsonToYjs } from "../../yjs-to-json";
import { deserializeFromHTML } from "../../serialization/html";
import { eq, and } from "drizzle-orm";

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
    execute: async function* ({ title, content, parentId }) {
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
            yield {
              state: "error",
              error: `The parent document you're trying to create this under doesn't exist or you don't have access to it.`,
            };
            return;
          }
        }

        const id = createId();
        const slug = `${slugify(title)}-${createId().slice(0, 6)}`;

        // PHASE 1: Create empty document immediately
        yield {
          state: "creating",
          message: `Creating document "${title}"...`,
        };

        const emptyContent = { type: "doc", content: [] };
        const emptyYjsState = convertJsonToYjs(emptyContent);

        // Insert document into database immediately (empty)
        await db.insert(documentsTable).values({
          id,
          title,
          slug,
          userId,
          organizationId,
          yjsState: emptyYjsState,
          parentId: parentId || null,
          indexStatus: "pending",
          published: false,
        });

        yield {
          state: "created",
          message: content
            ? `Document "${title}" created. Adding content...`
            : `Document "${title}" created successfully.`,
          document: {
            id,
            title,
            slug,
            parentId,
          },
        };

        if (content) {
          try {
            yield {
              state: "applying-content",
              message: "Adding content to document...",
              document: {
                id,
                title,
                slug,
                parentId,
              },
            };

            const jsonContent = deserializeFromHTML(content);
            const yjsState = convertJsonToYjs(jsonContent);

            // Update document with content
            await db
              .update(documentsTable)
              .set({
                yjsState,
                updatedAt: new Date(),
              })
              .where(eq(documentsTable.id, id));

            yield {
              state: "success",
              message: `Document "${title}" created with content successfully.`,
              document: {
                id,
                title,
                slug,
                parentId,
              },
              contentApplied: true,
            };
          } catch (contentError: any) {
            console.error("Failed to apply content:", contentError);
            // Document still exists, just without content
            yield {
              state: "partial-success",
              message: `Document "${title}" was created, but I couldn't add the content. You can add content manually by opening the document.`,
              document: {
                id,
                title,
                slug,
                parentId,
              },
              contentApplied: false,
            };
          }
        } else {
          // No content to apply, already successful
          yield {
            state: "success",
            message: `Document "${title}" created successfully.`,
            document: {
              id,
              title,
              slug,
              parentId,
            },
            contentApplied: false,
          };
        }
      } catch (error: any) {
        console.error("Failed to create document:", error);
        yield {
          state: "error",
          error: `Something went wrong while creating the document. Please try again.`,
        };
      }
    },
  });
