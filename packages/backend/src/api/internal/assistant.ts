import { openai } from "@ai-sdk/openai";
import { chatModel } from "@lydie/core/ai/llm";
import { createDocument } from "@lydie/core/ai/tools/create-document";
import { listDocuments } from "@lydie/core/ai/tools/list-documents";
import { moveDocuments } from "@lydie/core/ai/tools/move-documents";
import { readDocument } from "@lydie/core/ai/tools/read-document";
import { replaceInDocument } from "@lydie/core/ai/tools/replace-in-document";
import { searchDocuments } from "@lydie/core/ai/tools/search-documents";
import { searchInDocument } from "@lydie/core/ai/tools/search-in-document";
import { showDocuments } from "@lydie/core/ai/tools/show-documents";
import { VisibleError } from "@lydie/core/error";
import {
  assistantAgentsTable,
  assistantConversationsTable,
  assistantMessagesTable,
  db,
  documentsTable,
  llmUsageTable,
} from "@lydie/database";
import { ToolLoopAgent, createAgentUIStreamResponse, validateUIMessages } from "ai";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { buildAssistantSystemPrompt } from "../utils/ai/assistant/system-prompt";
import { generateConversationTitle } from "../utils/conversation";
import { checkDailyMessageLimit } from "../utils/usage-limits";

export const messageMetadataSchema = z
  .object({
    usage: z.number().optional(),
    createdAt: z.string().optional(),
    model: z.string().optional(),
    duration: z.number().optional(),
    contextDocuments: z
      .array(
        z.object({
          id: z.string(),
          current: z.boolean().optional(),
        }),
      )
      .optional(),
    documentWordCount: z.number().optional(),
  })
  .passthrough();

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

export const AssistantRoute = new Hono<{
  Variables: {
    organizationId: string;
    user: any;
    session: any;
  };
}>().post("/", async (c) => {
  try {
    const {
      messages,
      conversationId: providedConversationId,
      agentId: bodyAgentId,
    } = await c.req.json();
    const userId = c.get("user").id;
    const organizationId = c.get("organizationId");

    // Extract agentId from message metadata if not provided in body
    const latestMessageForAgent = messages[messages.length - 1];
    const agentId = bodyAgentId || latestMessageForAgent?.metadata?.agentId || null;

    let conversationId = providedConversationId;
    let conversation = null;

    if (conversationId) {
      [conversation] = await db
        .select()
        .from(assistantConversationsTable)
        .where(
          and(
            eq(assistantConversationsTable.id, conversationId),
            eq(assistantConversationsTable.organizationId, organizationId),
            eq(assistantConversationsTable.userId, userId),
          ),
        );
    }

    if (!conversation) {
      const title = await generateConversationTitle(messages[0]);
      const [newConversation] = await db
        .insert(assistantConversationsTable)
        .values({
          userId,
          organizationId,
          agentId: agentId || null,
          title,
        })
        .returning();
      conversationId = newConversation.id;
    }

    const latestMessage = messages[messages.length - 1];
    const user = c.get("user");

    const messageMetadata = latestMessage?.metadata ?? {};
    const documentWordCount = messageMetadata.documentWordCount as number | undefined;
    const contextDocumentsFromMetadata = Array.isArray(messageMetadata.contextDocuments)
      ? messageMetadata.contextDocuments
      : [];

    const organization = await db.query.organizationsTable.findFirst({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new HTTPException(404, {
        message: "Organization not found",
      });
    }

    const isAdmin = (user as any)?.role === "admin";
    if (!isAdmin) {
      const limitCheck = await checkDailyMessageLimit({
        id: organization.id,
        subscriptionPlan: organization.subscriptionPlan,
        subscriptionStatus: organization.subscriptionStatus,
      });

      if (!limitCheck.allowed) {
        throw new VisibleError(
          "usage_limit_exceeded",
          `Daily message limit reached. You've used ${limitCheck.messagesUsed} of ${limitCheck.messageLimit} messages today. Upgrade to Pro for unlimited messages.`,
          429,
        );
      }
    }

    // Extract document IDs and validate they exist in the database
    const contextDocumentIds: string[] = Array.from(
      new Set(
        contextDocumentsFromMetadata
          .filter(
            (doc: any): doc is { id: string; current?: boolean } =>
              typeof doc === "object" && typeof doc.id === "string" && doc.id.length > 0,
          )
          .map((doc: { id: string; current?: boolean }) => doc.id),
      ),
    );

    const contextDocuments =
      contextDocumentIds.length > 0
        ? await db
            .select({
              id: documentsTable.id,
              title: documentsTable.title,
            })
            .from(documentsTable)
            .where(
              and(
                eq(documentsTable.organizationId, organizationId),
                inArray(documentsTable.id, contextDocumentIds),
                sql`${documentsTable.deletedAt} IS NULL`,
              ),
            )
        : [];

    // Merge database info with metadata to preserve the 'current' flag
    const contextDocumentsWithMetadata = contextDocuments.map((doc) => {
      const metadataDoc = contextDocumentsFromMetadata.find((d: any) => d.id === doc.id);
      return {
        id: doc.id,
        title: doc.title || "Untitled document",
        current: metadataDoc?.current === true,
      };
    });

    const currentDocument = contextDocumentsWithMetadata.find((doc) => doc.current) || null;

    // Save the user message after limit check passes with enhanced metadata
    await saveMessage({
      conversationId,
      parts: latestMessage.parts,
      role: "user",
      metadata: {
        ...latestMessage.metadata,
        contextDocuments: contextDocumentsWithMetadata,
      },
    });

    const effectiveAgentId = agentId || conversation?.agentId;
    let agentSystemPrompt: string;

    if (effectiveAgentId) {
      const [agent] = await db
        .select()
        .from(assistantAgentsTable)
        .where(eq(assistantAgentsTable.id, effectiveAgentId))
        .limit(1);

      if (!agent) {
        throw new HTTPException(404, {
          message: "Agent not found",
        });
      }

      agentSystemPrompt = agent.systemPrompt;
    } else {
      const [defaultAgent] = await db
        .select()
        .from(assistantAgentsTable)
        .where(
          and(eq(assistantAgentsTable.isDefault, true), eq(assistantAgentsTable.name, "Default")),
        )
        .limit(1);

      if (!defaultAgent) {
        throw new HTTPException(500, {
          message: "Default agent not found. Please run the seed script.",
        });
      }

      agentSystemPrompt = defaultAgent.systemPrompt;
    }

    const systemPrompt = buildAssistantSystemPrompt(agentSystemPrompt);

    const startTime = Date.now();

    const contextInfo = createContextInfo({
      contextDocuments: contextDocumentsWithMetadata,
      documentWordCount,
      focusedContent: messageMetadata.focusedContent,
    });

    const enhancedLatestMessage =
      contextInfo && latestMessage
        ? {
            ...latestMessage,
            parts: [
              ...latestMessage.parts,
              {
                type: "text",
                text: `${latestMessage.content ?? ""}\n\n${contextInfo}`,
              },
            ],
          }
        : latestMessage;

    const enhancedMessages =
      enhancedLatestMessage && latestMessage
        ? [...messages.slice(0, -1), enhancedLatestMessage]
        : messages;

    const tools: Record<string, any> = {
      web_search: openai.tools.webSearch({
        searchContextSize: "low",
      }),
      search_documents: searchDocuments(userId, organizationId, currentDocument?.id),
      read_document: readDocument(userId, organizationId),
      list_documents: listDocuments(userId, organizationId, currentDocument?.id),
      show_documents: showDocuments(userId, organizationId, currentDocument?.id),
      move_documents: moveDocuments(userId, organizationId),
      create_document: createDocument(userId, organizationId),
    };

    if (currentDocument?.id) {
      tools.search_in_document = searchInDocument(currentDocument.id, userId, organizationId);
      tools.replace_in_document = replaceInDocument();
    }

    const agent = new ToolLoopAgent({
      providerOptions: {
        openai: { reasoningEffort: "low" },
      },
      model: chatModel,
      instructions: systemPrompt,
      tools,
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

        const totalTokens = (assistantMessage.metadata as MessageMetadata)?.usage || 0;

        if (totalTokens > 0) {
          const promptTokens = Math.floor(totalTokens * 0.7);
          const completionTokens = totalTokens - promptTokens;

          await db.insert(llmUsageTable).values({
            conversationId,
            messageId: savedMessage.id,
            organizationId,
            source: "assistant",
            model: chatModel.modelId,
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
    if (e instanceof VisibleError) {
      throw e;
    }

    throw new VisibleError(
      "chat_processing_error",
      "An error occurred while processing your request",
    );
  }
});

function createContextInfo({
  contextDocuments,
  documentWordCount,
  focusedContent,
}: {
  contextDocuments: Array<{ id: string; title: string; current?: boolean }>;
  documentWordCount?: number;
  focusedContent?: string;
}) {
  if (contextDocuments.length === 0 && !focusedContent && !documentWordCount) {
    return "";
  }

  const parts: string[] = [];
  const currentDocument = contextDocuments.find((doc) => doc.current);
  const otherDocuments = contextDocuments.filter((doc) => !doc.current);

  // Primary Document section
  if (currentDocument) {
    parts.push("## Primary Document");
    parts.push(`**${currentDocument.title}**`);
    parts.push(`Document ID: \`${currentDocument.id}\``);
    
    if (typeof documentWordCount === "number") {
      parts.push(`Word count: ${documentWordCount}`);
    }
    
    parts.push(
      "\nWhen the user says \"this document\", \"the document\", or similar, they refer to this document."
    );
  }

  // Context Documents section
  if (otherDocuments.length > 0) {
    parts.push("\n## Context Documents");
    parts.push("Available for reading and reference:\n");
    
    for (const doc of otherDocuments) {
      parts.push(`- **${doc.title}** (ID: \`${doc.id}\`)`);
    }
  }

  // Focused Selection section
  if (focusedContent && focusedContent.trim()) {
    parts.push("\n## Focused Selection");
    parts.push("The user has selected this content:\n");
    parts.push("```");
    parts.push(focusedContent);
    parts.push("```");
  }

  return "\n---\n\n" + parts.join("\n") + "\n\n---";
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
    .insert(assistantMessagesTable)
    .values({
      conversationId,
      parts,
      role,
      metadata,
    })
    .returning();

  return savedMessage;
}
