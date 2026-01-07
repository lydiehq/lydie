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
        description: `Create a new document (page) in the knowledge base.
Use this tool when the user wants to create a new page, note, or document.
You can create a hierarchy of pages by specifying a parentId.
You can also optionally provide initial content in HTML format.

**IMPORTANT**: 
- The document is created FIRST (appearing immediately in the UI), then content is applied. This prevents data loss if content generation fails or is interrupted.
- If a user asks to "change", "improve", or "edit" a document, DO NOT create a new one automatically. Instead, inform them that this would create an entirely new document. Suggest that for edits, they should open the document and use the in-document chat. Only create a new document if they confirm they want a new separate file.

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
                    "The ID of the parent document to create this document under (for nesting pages)."
                ),
        }),
        execute: async function* ({ title, content, parentId }) {
            try {
                // Verify parent existence if provided
                if (parentId) {
                    const [parent] = await db
                        .select()
                        .from(documentsTable)
                        .where(and(
                            eq(documentsTable.id, parentId),
                            eq(documentsTable.organizationId, organizationId)
                        ))
                        .limit(1);

                    if (!parent) {
                        yield {
                            state: "error",
                            error: `Parent document with ID "${parentId}" not found.`,
                        };
                        return;
                    }
                }

                const id = createId();
                const slug = slugify(title);

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

                // Yield document created state
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

                // PHASE 2: Apply content if provided
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
                                updatedAt: new Date()
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
                            message: `Document "${title}" created, but failed to add content: ${contentError.message}`,
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
                    error: `Failed to create document: ${error.message}`,
                };
            }
        },
    });
