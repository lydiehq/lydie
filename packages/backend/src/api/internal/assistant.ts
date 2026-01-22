import { Hono } from "hono"
import { chatModel } from "@lydie/core/ai/llm"
import { validateUIMessages, createAgentUIStreamResponse, ToolLoopAgent, smoothStream, stepCountIs } from "ai"
import {
  db,
  assistantConversationsTable,
  assistantMessagesTable,
  llmUsageTable,
  userSettingsTable,
  documentsTable,
} from "@lydie/database"
import { eq, and, sql, inArray } from "drizzle-orm"
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
import { searchInDocument } from "@lydie/core/ai/tools/search-in-document"
import { readCurrentDocument } from "@lydie/core/ai/tools/read-current-document"
import { replaceInDocument } from "@lydie/core/ai/tools/replace-in-document"
import { openai } from "@ai-sdk/openai"

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
          title: z.string(),
        }),
      )
      .optional(),
    currentDocument: z
      .object({
        id: z.string(),
        title: z.string(),
      })
      .optional(),
  })
  .passthrough()

export type MessageMetadata = z.infer<typeof messageMetadataSchema>

export const AssistantRoute = new Hono<{
  Variables: {
    organizationId: string
    user: any
    session: any
  }
}>().post("/", async (c) => {
  try {
    const {
      messages,
      conversationId: providedConversationId,
      currentDocument: providedCurrentDocument,
      contextDocumentIds: providedContextDocumentIds,
    } = await c.req.json()
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

    const messageMetadata = latestMessage?.metadata ?? {}
    const currentDocumentId =
      providedCurrentDocument?.id ?? messageMetadata.currentDocument?.id ?? messageMetadata.currentDocumentId
    const documentWordCount =
      providedCurrentDocument?.wordCount ??
      messageMetadata.currentDocument?.wordCount ??
      messageMetadata.documentWordCount
    const contextDocumentIds = Array.isArray(providedContextDocumentIds)
      ? providedContextDocumentIds
      : Array.isArray(messageMetadata.contextDocumentIds)
        ? messageMetadata.contextDocumentIds
        : []

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

    // Fetch current document first
    let currentDocument: { id: string; title: string; organizationId: string } | null = null

    if (currentDocumentId) {
      const [document] = await db
        .select({
          id: documentsTable.id,
          title: documentsTable.title,
          organizationId: documentsTable.organizationId,
        })
        .from(documentsTable)
        .where(
          and(
            eq(documentsTable.id, currentDocumentId),
            eq(documentsTable.organizationId, organizationId),
            sql`${documentsTable.deletedAt} IS NULL`,
          ),
        )
        .limit(1)

      if (!document) {
        throw new HTTPException(404, {
          message: "Document not found",
        })
      }

      currentDocument = document
    }

    // Resolve context document IDs to full document info
    const uniqueContextDocumentIds = Array.from(new Set(contextDocumentIds.filter(Boolean)))
    const contextDocuments =
      uniqueContextDocumentIds.length > 0
        ? await db
            .select({
              id: documentsTable.id,
              title: documentsTable.title,
            })
            .from(documentsTable)
            .where(
              and(
                eq(documentsTable.organizationId, organizationId),
                inArray(documentsTable.id, uniqueContextDocumentIds),
                sql`${documentsTable.deletedAt} IS NULL`,
              ),
            )
        : []

    // Save the user message after limit check passes with enhanced metadata
    await saveMessage({
      conversationId,
      parts: latestMessage.parts,
      role: "user",
      metadata: {
        ...latestMessage.metadata,
        contextDocuments: contextDocuments.map((doc) => ({
          id: doc.id,
          title: doc.title || "Untitled document",
        })),
        currentDocument: currentDocument
          ? {
              id: currentDocument.id,
              title: currentDocument.title || "Untitled document",
            }
          : undefined,
      },
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

    const contextInfo = createContextInfo({
      currentDocument,
      contextDocuments,
      documentWordCount,
      focusedContent: messageMetadata.focusedContent,
    })

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
        : latestMessage

    const enhancedMessages =
      enhancedLatestMessage && latestMessage ? [...messages.slice(0, -1), enhancedLatestMessage] : messages

    const tools: Record<string, any> = {
      web_search: openai.tools.webSearch({
        searchContextSize: "low",
      }),
      search_documents: searchDocuments(userId, organizationId, currentDocument?.id),
      read_document: readDocument(userId, organizationId),
      list_documents: listDocuments(userId, organizationId, currentDocument?.id),
      move_documents: moveDocuments(userId, organizationId),
      create_document: createDocument(userId, organizationId),
    }

    if (currentDocument?.id) {
      tools.search_in_document = searchInDocument(currentDocument.id, userId, currentDocument.organizationId)
      tools.read_current_document = readCurrentDocument(currentDocument.id)
      tools.replace_in_document = replaceInDocument()
    }

    const agent = new ToolLoopAgent({
      providerOptions: {
        openai: { reasoningEffort: currentDocument ? "medium" : "low" },
      },
      model: chatModel,
      instructions: systemPrompt,
      // TODO: fix - this is just an arbitrary number to stop the agent from running forever
      stopWhen: stepCountIs(50),
      tools,
    })

    return createAgentUIStreamResponse({
      agent,
      uiMessages: await validateUIMessages({
        messages: enhancedMessages,
      }),
      messageMetadata: ({ part }): MessageMetadata | undefined => {
        if (part.type === "start") {
          return {
            createdAt: new Date().toISOString(),
            contextDocuments: contextDocuments.map((doc) => ({
              id: doc.id,
              title: doc.title || "Untitled document",
            })),
            currentDocument: currentDocument
              ? {
                  id: currentDocument.id,
                  title: currentDocument.title || "Untitled document",
                }
              : undefined,
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

        // Ensure the final saved metadata includes all context information
        const enhancedMetadata = {
          ...(assistantMessage.metadata as MessageMetadata),
          contextDocuments: contextDocuments.map((doc) => ({
            id: doc.id,
            title: doc.title || "Untitled document",
          })),
          currentDocument: currentDocument
            ? {
                id: currentDocument.id,
                title: currentDocument.title || "Untitled document",
              }
            : undefined,
        }

        const savedMessage = await saveMessage({
          conversationId,
          parts: assistantMessage.parts,
          metadata: enhancedMetadata,
          role: "assistant",
        })

        // Extract usage data from metadata
        const totalTokens = enhancedMetadata?.usage || 0

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
            model: chatModel.modelId,
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

function createContextInfo({
  currentDocument,
  contextDocuments,
  documentWordCount,
  focusedContent,
}: {
  currentDocument: { id: string; title: string; organizationId: string } | null
  contextDocuments: Array<{ id: string; title: string | null }>
  documentWordCount?: number
  focusedContent?: string
}) {
  if (!currentDocument && contextDocuments.length === 0 && !focusedContent && !documentWordCount) {
    return ""
  }

  let context = `<additional_data>
Below are some potentially helpful pieces of information for responding to the user's request:`

  if (currentDocument) {
    context += `

Current Document:
- Title: ${currentDocument.title || "Untitled document"}
- ID: ${currentDocument.id}`
  }

  if (typeof documentWordCount === "number") {
    context += `

Current Document Word Count: ${documentWordCount}`
  }

  if (contextDocuments.length > 0) {
    context += `

Context Documents:`
    for (const doc of contextDocuments) {
      context += `
- ${doc.title || "Untitled document"} (ID: ${doc.id})`
    }
  }

  if (focusedContent && focusedContent.trim()) {
    context += `

<focused_selection>
The user has selected the following content, which may indicate their area of focus:
\`\`\`
${focusedContent}
\`\`\`
</focused_selection>`
  }

  context += `
</additional_data>`

  return context
}

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
