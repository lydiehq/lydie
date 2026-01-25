import { assistantConversationsTable, assistantMessagesTable, db } from "@lydie/database";
import { PLAN_LIMITS, PLAN_TYPES, type PlanType } from "@lydie/database/billing-types";
import { and, eq, gte } from "drizzle-orm";

// Get the start of today in UTC
function getStartOfToday(): Date {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

// Count user messages (not LLM usage) sent today for a given organization
// We count from message tables because usage is only created after completion
async function getUserMessagesToday(organizationId: string): Promise<number> {
  const startOfDay = getStartOfToday();

  const assistantConvs = await db
    .select({ id: assistantConversationsTable.id })
    .from(assistantConversationsTable)
    .where(
      and(
        eq(assistantConversationsTable.organizationId, organizationId),
        gte(assistantConversationsTable.createdAt, startOfDay),
      ),
    );

  const assistantConvIds = assistantConvs.map((c) => c.id);

  if (assistantConvIds.length === 0) {
    return 0;
  }

  const assistantMessages = await db
    .select()
    .from(assistantMessagesTable)
    .where(
      and(
        eq(assistantMessagesTable.role, "user"),
        gte(assistantMessagesTable.createdAt, startOfDay),
      ),
    );

  return assistantMessages.filter((msg) => assistantConvIds.includes(msg.conversationId)).length;
}

// Get the current plan for an organization
function getCurrentPlan(
  subscriptionPlan?: string | null,
  subscriptionStatus?: string | null,
): PlanType {
  const hasProAccess = subscriptionPlan === "pro" && subscriptionStatus === "active";

  return hasProAccess ? PLAN_TYPES.PRO : PLAN_TYPES.FREE;
}

// Check if an organization has reached their daily message limit
// Returns { allowed: boolean, messagesUsed: number, messageLimit: number | null }
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
    organization.subscriptionStatus,
  );

  const planLimits = PLAN_LIMITS[currentPlan];
  const messageLimit = planLimits.maxMessagesPerDay;

  if (messageLimit === null) {
    return {
      allowed: true,
      messagesUsed: 0,
      messageLimit: null,
      currentPlan,
    };
  }

  const messagesUsed = await getUserMessagesToday(organization.id);
  const allowed = messagesUsed < messageLimit;

  return {
    allowed,
    messagesUsed,
    messageLimit,
    currentPlan,
  };
}
