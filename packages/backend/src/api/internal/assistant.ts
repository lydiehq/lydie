import { Hono } from "hono";
import { google } from "@lydie/core/ai/llm";
import {
  validateUIMessages,
  createAgentUIStreamResponse,
  ToolLoopAgent,
  smoothStream,
  stepCountIs,
  tool,
} from "ai";
import {
  db,
  assistantConversationsTable,
  assistantMessagesTable,
  llmUsageTable,
  userSettingsTable,
} from "@lydie/database";
import { eq } from "drizzle-orm";
import { generateConversationTitle } from "../utils/conversation";
import { HTTPException } from "hono/http-exception";
import { VisibleError } from "@lydie/core/error";
import { buildAssistantSystemPrompt } from "../utils/ai/assistant/system-prompt";
import { z } from "zod";
import { checkDailyMessageLimit } from "../utils/usage-limits";
import { searchDocuments } from "@lydie/core/ai/tools/search-documents";
import { readDocument } from "@lydie/core/ai/tools/read-document";
import { listDocuments } from "@lydie/core/ai/tools/list-documents";
import { createFolder } from "@lydie/core/ai/tools/create-folder";
import { moveDocuments } from "@lydie/core/ai/tools/move-documents";
import type { PromptStyle } from "@lydie/core/prompts";

export const messageMetadataSchema = z.object({
  usage: z.number().optional(),
  timestamp: z.string().optional(),
  model: z.string().optional(),
  duration: z.number().optional(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

export const AssistantRoute = new Hono<{
  Variables: {
    organizationId: string;
    user: any;
    session: any;
  };
}>().post("/", async (c) => {
  try {
    const { messages, conversationId: providedConversationId } =
      await c.req.json();
    const userId = c.get("user").id;
    const organizationId = c.get("organizationId");

    let conversationId = providedConversationId;
    let conversation = null;

    if (conversationId) {
      [conversation] = await db
        .select()
        .from(assistantConversationsTable)
        .where(eq(assistantConversationsTable.id, conversationId));

      if (conversation && conversation.userId !== userId) {
        throw new HTTPException(403, {
          message: "You are not authorized to access this conversation",
        });
      }
    }

    if (!conversation) {
      const title = await generateConversationTitle(messages[0]);
      await db.insert(assistantConversationsTable).values({
        id: providedConversationId,
        userId,
        organizationId,
        title,
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
    const organization = await db.query.organizationsTable.findFirst({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new HTTPException(404, {
        message: "Organization not found",
      });
    }

    const limitCheck = await checkDailyMessageLimit({
      id: organization.id,
      subscriptionPlan: organization.subscriptionPlan,
      subscriptionStatus: organization.subscriptionStatus,
    });

    if (!limitCheck.allowed) {
      throw new HTTPException(429, {
        message: `Daily message limit reached. You've used ${limitCheck.messagesUsed} of ${limitCheck.messageLimit} messages today. Upgrade to Pro for unlimited messages.`,
      });
    }

    // Fetch user settings for prompt style
    const [userSettings] = await db
      .select()
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, userId))
      .limit(1);

    const promptStyle =
      (userSettings?.aiPromptStyle as PromptStyle) || "default";
    const customPrompt = userSettings?.customPrompt || null;

    const systemPrompt = buildAssistantSystemPrompt(promptStyle, customPrompt);

    const startTime = Date.now();

    const agent = new ToolLoopAgent({
      model: google("gemini-3-flash-preview"),
      instructions: systemPrompt,
      // TODO: fix - this is just an arbitrary number to stop the agent from running forever
      stopWhen: stepCountIs(50),
      // @ts-expect-error - experimental_transform is not typed
      experimental_transform: smoothStream({ chunking: "word" }),
      tools: {
        searchDocuments: searchDocuments(userId, organizationId),
        readDocument: readDocument(userId, organizationId),
        listDocuments: listDocuments(userId, organizationId),
        createFolder: createFolder(userId, organizationId),
        moveDocuments: moveDocuments(userId, organizationId),
        createDocument: tool({
          description:
            "Create a new document. This tool creates the document in the system but DOES NOT redirect the user. The user will see a preview and a button to open it. Use this when the user asks to create a new document, note, or page. You can optionally provide content for the new document.",
          inputSchema: z.object({
            title: z.string().optional().describe("The title of the document"),
            content: z
              .string()
              .optional()
              .describe(
                "The initial content of the document in HTML format. Use HTML tags like <p>, <h2>, <ul>, etc."
              ),
          }),
        }),
      },
    });

    return createAgentUIStreamResponse({
      agent,
      uiMessages: await validateUIMessages({
        messages,
      }),
      messageMetadata: ({ part }): MessageMetadata | undefined => {
        if (part.type === "start") {
          return {
            timestamp: new Date().toISOString(),
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
            organizationId,
            source: "assistant",
            model: "gemini-3-flash-preview",
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
    // Re-throw HTTPException as-is
    if (e instanceof HTTPException) {
      throw e;
    }
    // Re-throw VisibleError as-is for backward compatibility
    if (e instanceof VisibleError) {
      throw e;
    }
    throw new HTTPException(500, {
      message: "An error occurred while processing your request",
    });
  }
});

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
