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
You can also optionally provide initial content in HTML format.`,
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
            yield {
                state: "pending",
                message: `Creating document "${title}"...`,
            };

            try {
                const id = createId();
                const slug = slugify(title);

                let yjsState: string | null = null;
                if (content) {
                    try {
                        const jsonContent = deserializeFromHTML(content);
                        yjsState = convertJsonToYjs(jsonContent);
                    } catch (e) {
                        console.error("Failed to deserialize HTML content:", e);
                        // Fallback to empty doc if content parsing fails
                        const emptyContent = { type: "doc", content: [] };
                        yjsState = convertJsonToYjs(emptyContent);
                    }
                } else {
                    const emptyContent = { type: "doc", content: [] };
                    yjsState = convertJsonToYjs(emptyContent);
                }

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

                yield {
                    state: "success",
                    message: `Successfully created document "${title}".`,
                    document: {
                        id,
                        title,
                        slug,
                        parentId,
                    },
                };
            } catch (error: any) {
                console.error("Failed to create document:", error);
                yield {
                    state: "error",
                    error: `Failed to create document: ${error.message}`,
                };
            }
        },
    });
