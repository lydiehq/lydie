import {
  db,
  documentMessagesTable,
  assistantMessagesTable,
  documentsTable,
  documentConversationsTable,
  assistantConversationsTable,
} from "@lydie/database";
import { eq, and, gte, inArray, isNull } from "drizzle-orm";
import {
  PLAN_LIMITS,
  PLAN_TYPES,
  type PlanType,
} from "@lydie/database/billing-types";

/**
 * Get the start of today in UTC
 */
function getStartOfToday(): Date {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

/**
 * Count user messages (not LLM usage) sent today for a given organization
 * We count from message tables because usage is only created after completion
 */
async function getUserMessagesToday(organizationId: string): Promise<number> {
  const startOfDay = getStartOfToday();

  // Get all documents for this organization (excluding deleted)
  const orgDocuments = await db
    .select({ id: documentsTable.id })
    .from(documentsTable)
    .where(
      and(
        eq(documentsTable.organizationId, organizationId),
        isNull(documentsTable.deletedAt)
      )
    );

  const docIds = orgDocuments.map((d) => d.id);

  let docMessageCount = 0;
  let assistantMessageCount = 0;

  // Count user messages from document conversations for this org's documents
  if (docIds.length > 0) {
    // Get all conversations for documents in this org
    const conversations = await db
      .select({ id: documentConversationsTable.id })
      .from(documentConversationsTable)
      .where(inArray(documentConversationsTable.documentId, docIds));

    const conversationIds = conversations.map((c) => c.id);

    if (conversationIds.length > 0) {
      // Count user messages in these conversations
      const docMessages = await db
        .select()
        .from(documentMessagesTable)
        .where(
          and(
            eq(documentMessagesTable.role, "user"),
            gte(documentMessagesTable.createdAt, startOfDay)
          )
        );

      // Filter to only messages from our conversations
      docMessageCount = docMessages.filter((msg) =>
        conversationIds.includes(msg.conversationId)
      ).length;
    }
  }

  // Count user messages from assistant conversations for this org
  const assistantConvs = await db
    .select({ id: assistantConversationsTable.id })
    .from(assistantConversationsTable)
    .where(
      and(
        eq(assistantConversationsTable.organizationId, organizationId),
        gte(assistantConversationsTable.createdAt, startOfDay)
      )
    );

  const assistantConvIds = assistantConvs.map((c) => c.id);

  if (assistantConvIds.length > 0) {
    const assistantMessages = await db
      .select()
      .from(assistantMessagesTable)
      .where(
        and(
          eq(assistantMessagesTable.role, "user"),
          gte(assistantMessagesTable.createdAt, startOfDay)
        )
      );

    assistantMessageCount = assistantMessages.filter((msg) =>
      assistantConvIds.includes(msg.conversationId)
    ).length;
  }

  return docMessageCount + assistantMessageCount;
}

/**
 * Get the current plan for an organization
 */
function getCurrentPlan(
  subscriptionPlan?: string | null,
  subscriptionStatus?: string | null
): PlanType {
  const hasProAccess =
    subscriptionPlan === "pro" && subscriptionStatus === "active";

  return hasProAccess ? PLAN_TYPES.PRO : PLAN_TYPES.FREE;
}

/**
 * Check if an organization has reached their daily message limit
 * Returns { allowed: boolean, messagesUsed: number, messageLimit: number | null }
 */
export async function checkDailyMessageLimit(organization: {
  id: string;
  subscriptionPlan?: string | null;
  subscriptionStatus?: string | null;
}): Promise<{
  allowed: boolean;
  messagesUsed: number;
  messageLimit: number | null;
  currentPlan: PlanType;
}> {
  const currentPlan = getCurrentPlan(
    organization.subscriptionPlan,
    organization.subscriptionStatus
  );

  const planLimits = PLAN_LIMITS[currentPlan];
  const messageLimit = planLimits.maxMessagesPerDay;

  // Pro plan has unlimited messages
  if (messageLimit === null) {
    return {
      allowed: true,
      messagesUsed: 0,
      messageLimit: null,
      currentPlan,
    };
  }

  // Check usage for free plan - count actual user messages sent today
  const messagesUsed = await getUserMessagesToday(organization.id);
  const allowed = messagesUsed < messageLimit;

  return {
    allowed,
    messagesUsed,
    messageLimit,
    currentPlan,
  };
}
