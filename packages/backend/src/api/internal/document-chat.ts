import { Hono } from "hono";
import { documentChatModel, google } from "@lydie/core/ai/llm";
import {
  validateUIMessages,
  createAgentUIStreamResponse,
  ToolLoopAgent,
  smoothStream,
  stepCountIs,
} from "ai";
import {
  db,
  documentMessagesTable,
  userSettingsTable,
  llmUsageTable,
} from "@lydie/database";
import { documentConversationsTable, documentsTable } from "@lydie/database";
import { eq, and, sql } from "drizzle-orm";
import { generateConversationTitle } from "../utils/conversation";
import { HTTPException } from "hono/http-exception";
import { VisibleError } from "@lydie/core/error";
import { checkDailyMessageLimit } from "../utils/usage-limits";
import type { PromptStyle } from "@lydie/core/prompts";
import { buildSystemPrompt } from "../utils/ai/document-chat/system-prompt";
import { z } from "zod";
import { searchInDocument } from "@lydie/core/ai/tools/search-in-document";
import { readCurrentDocument } from "@lydie/core/ai/tools/read-current-document";
import { replaceInDocument } from "@lydie/core/ai/tools/replace-in-document";
import { searchDocuments } from "@lydie/core/ai/tools/search-documents";
import { readDocument } from "@lydie/core/ai/tools/read-document";
import { listDocuments } from "@lydie/core/ai/tools/list-documents";

export const messageMetadataSchema = z.object({
  usage: z.number().optional(),
  createdAt: z.string().optional(),
  duration: z.number().optional(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

export const DocumentChatRoute = new Hono<{
  Variables: {
    organizationId: string;
    user: any;
  };
}>().post("/", async (c) => {
  try {
    const {
      messages,
      conversationId: providedConversationId,
      documentId,
      documentWordCount,
    } = await c.req.json();
    const userId = c.get("user").id;

    let conversationId = providedConversationId;
    let conversation = null;

    if (conversationId) {
      [conversation] = await db
        .select()
        .from(documentConversationsTable)
        .where(eq(documentConversationsTable.id, conversationId));

      if (conversation) {
        // Check if user has access to the document through organization membership
        const [document] = await db
          .select()
          .from(documentsTable)
          .where(
            and(
              eq(documentsTable.id, conversation.documentId),
              sql`${documentsTable.deletedAt} IS NULL`
            )
          );

        if (!document) {
          throw new HTTPException(404, {
            message: "Document not found",
          });
        }

        // Verify user has access to this organization
        const organization = await db.query.organizationsTable.findFirst({
          where: {
            id: document.organizationId,
          },
          with: {
            members: {
              where: {
                userId: userId,
              },
            },
          },
        });

        if (!organization || organization.members.length === 0) {
          throw new HTTPException(403, {
            message: "You are not authorized to access this conversation",
          });
        }
      }
    }

    if (!conversation) {
      const title = await generateConversationTitle(messages[0]);
      await db.insert(documentConversationsTable).values({
        id: providedConversationId,
        userId,
        documentId,
        title,
      });
    }

    const organizationId = c.get("organizationId");

    const [currentDocument] = await db
      .select()
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.id, documentId),
          eq(documentsTable.organizationId, organizationId),
          sql`${documentsTable.deletedAt} IS NULL`
        )
      );

    if (!currentDocument) {
      throw new HTTPException(404, {
        message: "Document not found",
      });
    }

    // Verify user has access to this organization (double-check for security)
    const organization = await db.query.organizationsTable.findFirst({
      where: {
        id: organizationId,
      },
      with: {
        members: {
          where: {
            userId: userId,
          },
        },
      },
    });

    if (!organization || organization.members.length === 0) {
      throw new HTTPException(403, {
        message: "You are not authorized to access this document",
      });
    }

    const latestMessage = messages[messages.length - 1];

    // Save the user message first to prevent race conditions
    await saveMessage({
      conversationId,
      parts: latestMessage.parts,
      role: "user",
      metadata: latestMessage.metadata,
    });

    // Check daily message limit AFTER saving to prevent race conditions
    // This ensures the message we just saved is counted
    const limitCheck = await checkDailyMessageLimit({
      id: organization.id,
      subscriptionPlan: organization.subscriptionPlan,
      subscriptionStatus: organization.subscriptionStatus,
    });

    if (!limitCheck.allowed) {
      throw new VisibleError(
        "usage_limit_exceeded",
        `Daily message limit reached. You've used ${limitCheck.messagesUsed} of ${limitCheck.messageLimit} messages today. Upgrade to Pro for unlimited messages.`,
        429
      );
    }

    const focusedContent = latestMessage.metadata?.focusedContent;

    const contextInfo = createContextInfo(
      focusedContent,
      documentWordCount ?? 0
    );

    const enhancedLatestMessage = {
      ...latestMessage,
      parts: [
        ...latestMessage.parts,
        {
          type: "text",
          text: `${latestMessage.content}\n\n${contextInfo}`,
        },
      ],
    };

    const enhancedMessages = [...messages.slice(0, -1), enhancedLatestMessage];

    const [userSettings] = await db
      .select()
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, userId))
      .limit(1);

    const promptStyle =
      (userSettings?.aiPromptStyle as PromptStyle) || "default";
    const customPrompt = userSettings?.customPrompt || null;

    const startTime = Date.now();

    const systemPrompt = buildSystemPrompt(promptStyle, customPrompt);

    const agent = new ToolLoopAgent({
      model: google("gemini-3-flash-preview"),
      instructions: systemPrompt,
      // TODO: fix - this is just an arbitrary number to stop the agent from running forever
      stopWhen: stepCountIs(50),
      // @ts-expect-error - experimental_transform is not typed
      experimental_transform: smoothStream({ chunking: "word" }),
      tools: {
        // google_search: google.tools.googleSearch({}),
        search_in_document: searchInDocument(
          documentId,
          userId,
          currentDocument.organizationId
        ),
        read_current_document: readCurrentDocument(documentId),
        replace_in_document: replaceInDocument(),
        search_documents: searchDocuments(
          userId,
          currentDocument.organizationId,
          currentDocument.id
        ),
        read_document: readDocument(userId, currentDocument.organizationId),
        list_documents: listDocuments(
          userId,
          currentDocument.organizationId,
          currentDocument.id
        ),
      },
    });

    return createAgentUIStreamResponse({
      agent,
      uiMessages: await validateUIMessages({
        messages: enhancedMessages,
      }),
      messageMetadata: ({ part }): MessageMetadata | undefined => {
        if (part.type === "start") {
          return {
            createdAt: new Date().toISOString(),
          };
        }
        if (part.type === "finish") {
          return {
            duration: Date.now() - startTime,
            usage: part.totalUsage.totalTokens,
          };
        }
        return undefined;
      },
      onFinish: async ({ messages: finalMessages }) => {
        const assistantMessage = finalMessages[finalMessages.length - 1];
        const savedMessage = await saveMessage({
          conversationId,
          parts: assistantMessage.parts,
          metadata: assistantMessage.metadata as MessageMetadata,
          role: "assistant",
        });

        // Extract usage data from metadata
        const metadata = assistantMessage.metadata as MessageMetadata;
        const totalTokens = metadata?.usage || 0;

        // Save LLM usage data to the usage table
        if (totalTokens > 0) {
          // Estimate token split (Gemini doesn't always provide detailed breakdown)
          const promptTokens = Math.floor(totalTokens * 0.7);
          const completionTokens = totalTokens - promptTokens;

          await db.insert(llmUsageTable).values({
            conversationId,
            messageId: savedMessage.id,
            organizationId: currentDocument.organizationId,
            source: "document",
            model: documentChatModel.modelId || "gemini-2.5-flash",
            promptTokens,
            completionTokens,
            totalTokens,
            finishReason: "stop",
            toolCalls: null,
          });
        }
      },
    });
  } catch (e) {
    console.error(e);
    // Re-throw VisibleError as-is (including usage limit errors)
    if (e instanceof VisibleError) {
      throw e;
    }
    throw new VisibleError(
      "chat_processing_error",
      "An error occurred while processing your request"
    );
  }
});

function createContextInfo(
  focusedContent: string | undefined,
  documentWordCount: number
): string {
  let context = `<additional_data>
Below are some potentially helpful pieces of information for responding to the user's request:

Document Word Count: ${documentWordCount}`;

  if (focusedContent && focusedContent.trim()) {
    context += `

<focused_selection>
The user has selected the following content, which may indicate their area of focus:
\`\`\`
${focusedContent}
\`\`\`
</focused_selection>`;
  }

  context += `
</additional_data>`;

  return context;
}

async function saveMessage({
  conversationId,
  parts,
  role,
  metadata,
}: {
  conversationId: string;
  parts: object | undefined;
  role: string;
  metadata: MessageMetadata | undefined;
}) {
  if (!parts) {
    throw new Error("Message parts cannot be undefined");
  }

  const [savedMessage] = await db
    .insert(documentMessagesTable)
    .values({
      conversationId,
      parts,
      role,
      metadata,
    })
    .returning();

  return savedMessage;
}
