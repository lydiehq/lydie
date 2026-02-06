import { createGateway } from "@ai-sdk/gateway";
import { openai } from "@ai-sdk/openai";
import { getDefaultAgentById, getDefaultAgentByName } from "@lydie/core/ai/agents/defaults";
import { getDefaultModel, getModelById, type LLMModel } from "@lydie/core/ai/models";
import { createDocument } from "@lydie/core/ai/tools/create-document";
import { findDocuments } from "@lydie/core/ai/tools/find-documents";
import { moveDocuments } from "@lydie/core/ai/tools/move-documents";
import { readDocument } from "@lydie/core/ai/tools/read-document";
import { replaceInDocument } from "@lydie/core/ai/tools/replace-in-document";
import { scanDocuments } from "@lydie/core/ai/tools/scan-documents";
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
import { ToolLoopAgent, createAgentUIStreamResponse, smoothStream, validateUIMessages } from "ai";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { Resource } from "sst";
import { z } from "zod";

import { buildAssistantSystemPrompt } from "../utils/ai/assistant/system-prompt";
import { generateConversationTitle } from "../utils/conversation";
import { checkCreditBalance, consumeCredits } from "../utils/usage-limits";

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

    // Extract agentId and modelId from message metadata
    const latestMessageForAgent = messages[messages.length - 1];
    const agentId = bodyAgentId || latestMessageForAgent?.metadata?.agentId || null;
    const modelId = latestMessageForAgent?.metadata?.modelId || null;

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
          id: conversationId,
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
      with: {
        billing: true,
      },
    });

    if (!organization) {
      throw new HTTPException(404, {
        message: "Organization not found",
      });
    }

    // Get the selected model or use default
    const selectedModel = modelId ? getModelById(modelId) || getDefaultModel() : getDefaultModel();

    // Check credit balance before processing - now using per-message credits
    const isAdmin = (user as any)?.role === "admin";
    if (!isAdmin) {
      const creditCheck = await checkCreditBalance({
        organizationId: organization.id,
        userId: (user as any)?.id,
        subscriptionPlan: organization.billing?.plan,
        subscriptionStatus: organization.billing?.stripeSubscriptionStatus,
        creditsRequired: selectedModel.credits,
      });

      if (!creditCheck.allowed) {
        throw new VisibleError(
          "insufficient_credits",
          `You don't have enough credits for this model. The ${selectedModel.name} model costs ${selectedModel.credits} credit${selectedModel.credits > 1 ? "s" : ""} per message. You have ${creditCheck.creditsAvailable} credits remaining.`,
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
      // First check if it's a default agent (from code)
      const defaultAgent = getDefaultAgentById(effectiveAgentId);

      if (defaultAgent) {
        agentSystemPrompt = defaultAgent.systemPrompt;
      } else {
        // Check database for custom agents
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
      }
    } else {
      // Use the "Default" agent from code
      const defaultAgent = getDefaultAgentByName("Default");

      if (!defaultAgent) {
        throw new HTTPException(500, {
          message: "Default agent configuration error",
        });
      }

      agentSystemPrompt = defaultAgent.systemPrompt;
    }

    const systemPrompt = buildAssistantSystemPrompt(agentSystemPrompt);

    const startTime = Date.now();

    const contextInfo = createContextInfo({
      contextDocuments: contextDocumentsWithMetadata,
      documentWordCount,
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
      find_documents: findDocuments(userId, organizationId, currentDocument?.id),
      read_document: readDocument(userId, organizationId),
      scan_documents: scanDocuments(userId, organizationId, currentDocument?.id),
      show_documents: showDocuments(userId, organizationId, currentDocument?.id),
      move_documents: moveDocuments(userId, organizationId),
      create_document: createDocument(userId, organizationId),
    };

    if (currentDocument?.id) {
      tools.replace_in_document = replaceInDocument();
    }

    const gateway = createGateway({
      apiKey: Resource.ApiGatewayKey.value,
    });

    const chatModel = gateway(selectedModel.model);

    // Build provider options based on the selected model's provider
    const providerOptions: Record<string, any> = {
      openai: {
        parallelToolCalls: false,
      },
      google: {
        thinkingConfig: {
          includeThoughts: true,
        },
      },
      anthropic: {
        sendReasoning: true,
        thinking: { type: "enabled", budgetTokens: 3000 },
        disableParallelToolUse: true,
      },
      gateway: {
        order: ["groq", "cerebras", "baseten"],
      },
    };

    // Add provider-specific options if applicable
    if (selectedModel.provider === "openai" && selectedModel.id.includes("gpt-5")) {
      providerOptions.openai.include = ["reasoning.encrypted_content"];
      providerOptions.openai.reasoningSummary = "auto";
    }

    const agent = new ToolLoopAgent({
      providerOptions,
      model: chatModel,
      instructions: systemPrompt,
      tools,
    });

    return createAgentUIStreamResponse({
      agent,
      experimental_transform: smoothStream({
        delayInMs: 3,
        chunking: "word",
      }),
      uiMessages: await validateUIMessages({
        messages: enhancedMessages,
      }),
      abortSignal: c.req.raw.signal,
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
      onFinish: async ({ messages: finalMessages, isAborted }) => {
        if (isAborted) {
          console.log("Stream was aborted - skipping DB save");
          return;
        }

        const assistantMessage = finalMessages[finalMessages.length - 1];

        const savedMessage = await saveMessage({
          conversationId,
          parts: assistantMessage.parts,
          metadata: assistantMessage.metadata as MessageMetadata,
          role: "assistant",
        });

        // Use per-message credit cost from the selected model
        const creditsUsed = selectedModel.credits;

        // Consume credits from user's workspace balance
        await consumeCredits({
          organizationId,
          userId,
          creditsRequested: creditsUsed,
          actionType: "assistant_message",
          resourceId: savedMessage.id,
        });

        // Track usage locally with credits
        await db.insert(llmUsageTable).values({
          conversationId,
          messageId: savedMessage.id,
          organizationId,
          source: "assistant",
          model: selectedModel.model,
          creditsUsed,
          finishReason: "stop",
          toolCalls: null,
        });
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
}: {
  contextDocuments: Array<{ id: string; title: string; current?: boolean }>;
  documentWordCount?: number;
}) {
  if (contextDocuments.length === 0 && !documentWordCount) {
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
      '\nWhen the user says "this document", "the document", or similar, they refer to this document.',
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
