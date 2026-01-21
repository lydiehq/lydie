import { Hono } from "hono"
import { chatModel } from "@lydie/core/ai/llm"
import { validateUIMessages, createAgentUIStreamResponse, ToolLoopAgent, smoothStream, stepCountIs } from "ai"
import {
  db,
  assistantConversationsTable,
  assistantMessagesTable,
  llmUsageTable,
  userSettingsTable,
} from "@lydie/database"
import { eq } from "drizzle-orm"
import { generateConversationTitle } from "../utils/conversation"
import { HTTPException } from "hono/http-exception"
import { VisibleError } from "@lydie/core/error"
import { buildAssistantSystemPrompt } from "../utils/ai/assistant/system-prompt"
import { z } from "zod"
import { checkDailyMessageLimit } from "../utils/usage-limits"
import { searchDocuments } from "@lydie/core/ai/tools/search-documents"
import { readDocument } from "@lydie/core/ai/tools/read-document"
import { listDocuments } from "@lydie/core/ai/tools/list-documents"
import { moveDocuments } from "@lydie/core/ai/tools/move-documents"
import { createDocument } from "@lydie/core/ai/tools/create-document"
import type { PromptStyle } from "@lydie/core/prompts"

export const messageMetadataSchema = z.object({
  usage: z.number().optional(),
  timestamp: z.string().optional(),
  model: z.string().optional(),
  duration: z.number().optional(),
})

export type MessageMetadata = z.infer<typeof messageMetadataSchema>

export const AssistantRoute = new Hono<{
  Variables: {
    organizationId: string
    user: any
    session: any
  }
}>().post("/", async (c) => {
  try {
    const { messages, conversationId: providedConversationId } = await c.req.json()
    const userId = c.get("user").id
    const organizationId = c.get("organizationId")

    let conversationId = providedConversationId
    let conversation = null

    if (conversationId) {
      ;[conversation] = await db
        .select()
        .from(assistantConversationsTable)
        .where(eq(assistantConversationsTable.id, conversationId))

      if (conversation) {
        // Verify conversation belongs to the organization from context
        if (conversation.organizationId !== organizationId) {
          throw new HTTPException(403, {
            message: "You are not authorized to access this conversation",
          })
        }

        // Verify conversation belongs to the user
        if (conversation.userId !== userId) {
          throw new HTTPException(403, {
            message: "You are not authorized to access this conversation",
          })
        }
      }
    }

    if (!conversation) {
      const title = await generateConversationTitle(messages[0])
      await db.insert(assistantConversationsTable).values({
        id: providedConversationId,
        userId,
        organizationId,
        title,
      })
    }

    const latestMessage = messages[messages.length - 1]
    const user = c.get("user")

    // Check daily message limit BEFORE saving to prevent exceeding the limit
    // Skip limit check for admin users
    const organization = await db.query.organizationsTable.findFirst({
      where: { id: organizationId },
    })

    if (!organization) {
      throw new HTTPException(404, {
        message: "Organization not found",
      })
    }

    const isAdmin = (user as any)?.role === "admin"
    if (!isAdmin) {
      const limitCheck = await checkDailyMessageLimit({
        id: organization.id,
        subscriptionPlan: organization.subscriptionPlan,
        subscriptionStatus: organization.subscriptionStatus,
      })

      if (!limitCheck.allowed) {
        throw new VisibleError(
          "usage_limit_exceeded",
          `Daily message limit reached. You've used ${limitCheck.messagesUsed} of ${limitCheck.messageLimit} messages today. Upgrade to Pro for unlimited messages.`,
          429,
        )
      }
    }

    // Save the user message after limit check passes
    await saveMessage({
      conversationId,
      parts: latestMessage.parts,
      role: "user",
      metadata: latestMessage.metadata,
    })

    // Fetch user settings for prompt style
    const [userSettings] = await db
      .select()
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, userId))
      .limit(1)

    const promptStyle = (userSettings?.aiPromptStyle as PromptStyle) || "default"
    const customPrompt = userSettings?.customPrompt || null

    const systemPrompt = buildAssistantSystemPrompt(promptStyle, customPrompt)

    const startTime = Date.now()

    const agent = new ToolLoopAgent({
      providerOptions: {
        openai: { reasoningEffort: "low" },
      },
      model: chatModel,
      instructions: systemPrompt,
      // TODO: fix - this is just an arbitrary number to stop the agent from running forever
      stopWhen: stepCountIs(50),
      // @ts-expect-error - experimental_transform is not typed
      experimental_transform: smoothStream({ chunking: "word" }),
      tools: {
        search_documents: searchDocuments(userId, organizationId),
        read_document: readDocument(userId, organizationId),
        list_documents: listDocuments(userId, organizationId),
        move_documents: moveDocuments(userId, organizationId),
        create_document: createDocument(userId, organizationId),
      },
    })

    return createAgentUIStreamResponse({
      agent,
      uiMessages: await validateUIMessages({
        messages,
      }),
      messageMetadata: ({ part }): MessageMetadata | undefined => {
        if (part.type === "start") {
          return {
            timestamp: new Date().toISOString(),
          }
        }
        if (part.type === "finish") {
          return {
            duration: Date.now() - startTime,
            usage: part.totalUsage.totalTokens,
          }
        }
        return undefined
      },
      onFinish: async ({ messages: finalMessages }) => {
        const assistantMessage = finalMessages[finalMessages.length - 1]
        const savedMessage = await saveMessage({
          conversationId,
          parts: assistantMessage.parts,
          metadata: assistantMessage.metadata as MessageMetadata,
          role: "assistant",
        })

        // Extract usage data from metadata
        const metadata = assistantMessage.metadata as MessageMetadata
        const totalTokens = metadata?.usage || 0

        // Save LLM usage data to the usage table
        if (totalTokens > 0) {
          // Estimate token split (Gemini doesn't always provide detailed breakdown)
          const promptTokens = Math.floor(totalTokens * 0.7)
          const completionTokens = totalTokens - promptTokens

          await db.insert(llmUsageTable).values({
            conversationId,
            messageId: savedMessage.id,
            organizationId,
            source: "assistant",
            model: "gemini-3-flash-preview",
            promptTokens,
            completionTokens,
            totalTokens,
            finishReason: "stop",
            toolCalls: null,
          })
        }
      },
    })
  } catch (e) {
    if (e instanceof VisibleError) {
      throw e
    }

    throw new VisibleError("chat_processing_error", "An error occurred while processing your request")
  }
})

async function saveMessage({
  conversationId,
  parts,
  role,
  metadata,
}: {
  conversationId: string
  parts: object | undefined
  role: string
  metadata: MessageMetadata | undefined
}) {
  if (!parts) {
    throw new Error("Message parts cannot be undefined")
  }

  const [savedMessage] = await db
    .insert(assistantMessagesTable)
    .values({
      conversationId,
      parts,
      role,
      metadata,
    })
    .returning()

  return savedMessage
}
