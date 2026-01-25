import { Hono } from "hono"
import { chatModel } from "@lydie/core/ai/llm"
import { validateUIMessages, createAgentUIStreamResponse, ToolLoopAgent } from "ai"
import {
  db,
  assistantConversationsTable,
  assistantMessagesTable,
  assistantAgentsTable,
  llmUsageTable,
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
import { showDocuments } from "@lydie/core/ai/tools/show-documents"
import { moveDocuments } from "@lydie/core/ai/tools/move-documents"
import { createDocument } from "@lydie/core/ai/tools/create-document"
import { searchInDocument } from "@lydie/core/ai/tools/search-in-document"
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
    currentDocumentId: z.string().optional(),
    contextDocumentIds: z.array(z.string()).optional(),
    documentWordCount: z.number().optional(),
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
    const { messages, conversationId: providedConversationId, agentId } = await c.req.json()
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
        if (conversation.organizationId !== organizationId) {
          throw new HTTPException(403, {
            message: "You are not authorized to access this conversation",
          })
        }

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
        agentId: agentId || null,
        title,
      })
    }

    const latestMessage = messages[messages.length - 1]
    const user = c.get("user")

    const messageMetadata = latestMessage?.metadata ?? {}
    const currentDocumentId = messageMetadata.currentDocumentId as string | undefined
    const documentWordCount = messageMetadata.documentWordCount as number | undefined
    const contextDocumentIdsRaw = Array.isArray(messageMetadata.contextDocumentIds)
      ? messageMetadata.contextDocumentIds
      : []

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

    const contextDocumentIds: string[] = Array.isArray(contextDocumentIdsRaw)
      ? contextDocumentIdsRaw.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
      : []
    const uniqueContextDocumentIds = Array.from(new Set(contextDocumentIds))
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
        currentDocumentId: currentDocument?.id,
      },
    })

    const effectiveAgentId = agentId || conversation?.agentId
    let agentSystemPrompt: string

    if (effectiveAgentId) {
      const [agent] = await db
        .select()
        .from(assistantAgentsTable)
        .where(eq(assistantAgentsTable.id, effectiveAgentId))
        .limit(1)

      if (!agent) {
        throw new HTTPException(404, {
          message: "Agent not found",
        })
      }

      agentSystemPrompt = agent.systemPrompt
    } else {
      const [defaultAgent] = await db
        .select()
        .from(assistantAgentsTable)
        .where(and(eq(assistantAgentsTable.isDefault, true), eq(assistantAgentsTable.name, "Default")))
        .limit(1)

      if (!defaultAgent) {
        throw new HTTPException(500, {
          message: "Default agent not found. Please run the seed script.",
        })
      }

      agentSystemPrompt = defaultAgent.systemPrompt
    }

    const systemPrompt = buildAssistantSystemPrompt(agentSystemPrompt)

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
      show_documents: showDocuments(userId, organizationId, currentDocument?.id),
      move_documents: moveDocuments(userId, organizationId),
      create_document: createDocument(userId, organizationId),
    }

    if (currentDocument?.id) {
      tools.search_in_document = searchInDocument(currentDocument.id, userId, currentDocument.organizationId)
      tools.replace_in_document = replaceInDocument()
    }

    const agent = new ToolLoopAgent({
      providerOptions: {
        openai: { reasoningEffort: "low" },
      },
      model: chatModel,
      instructions: systemPrompt,
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

        const totalTokens = (assistantMessage.metadata as MessageMetadata)?.usage || 0

        if (totalTokens > 0) {
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

  const otherContextDocuments = contextDocuments.filter(
    (doc) => !currentDocument || doc.id !== currentDocument.id,
  )

  if (currentDocument) {
    context += `

Primary Document (when user says "this document", they refer to this):
- Title: ${currentDocument.title || "Untitled document"}
- ID: ${currentDocument.id}
- IMPORTANT: If the user asks to make changes to "this document" or similar, you should read this document first using read_document or read_current_document before making modifications.`
  }

  if (typeof documentWordCount === "number") {
    context += `

Primary Document Word Count: ${documentWordCount}`
  }

  if (contextDocuments.length > 0) {
    context += `

Context Documents (available for reading and reference):
IMPORTANT: These documents are provided as context. If the user asks to modify a document or make changes, you should read the relevant document(s) first using read_document before making modifications.`
    for (const doc of contextDocuments) {
      const isPrimary = currentDocument && doc.id === currentDocument.id
      context += `
- ${doc.title || "Untitled document"} (ID: ${doc.id})${isPrimary ? " [Primary Document]" : ""}`
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
