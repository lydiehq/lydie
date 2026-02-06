export const PLAN_TYPES = {
  FREE: "free",
  MONTHLY: "monthly",
  YEARLY: "yearly",
} as const;

export type PlanType = (typeof PLAN_TYPES)[keyof typeof PLAN_TYPES];

export const PLAN_LIMITS: Record<
  PlanType,
  {
    name: string;
    price: number; // Price per seat per month (in dollars)
    creditsPerSeat: number; // Credits per seat per month
    features: {
      aiAssistant: boolean;
    };
  }
> = {
  [PLAN_TYPES.FREE]: {
    name: "Free",
    price: 0,
    creditsPerSeat: 150,
    features: {
      aiAssistant: true,
    },
  },
  [PLAN_TYPES.MONTHLY]: {
    name: "Pro (Monthly)",
    price: 18,
    creditsPerSeat: 4000,
    features: {
      aiAssistant: true,
    },
  },
  [PLAN_TYPES.YEARLY]: {
    name: "Pro (Yearly)",
    price: 14, // Effective monthly price ($168/year)
    creditsPerSeat: 4000,
    features: {
      aiAssistant: true,
    },
  },
};

// Credit costs per model (credits per 1k output tokens)
// Multiplied by 5x to allow for more granular pricing and future flexibility
export const MODEL_CREDIT_COSTS: Record<string, number> = {
  "gpt-4o": 50, // 50 credits per 1k output tokens
  "gpt-4o-mini": 25, // 25 credits per 1k output tokens
  "gpt-5": 50, // 50 credits per 1k output tokens
  "gpt-5-mini": 25, // 25 credits per 1k output tokens
  "gpt-5.2": 50, // 50 credits per 1k output tokens
  "gemini-2.0-flash": 15, // 15 credits per 1k output tokens
  "gemini-2.5-flash": 15, // 15 credits per 1k output tokens
  "gemini-2.5-flash-lite": 10, // 10 credits per 1k output tokens
  default: 25, // Default fallback
};

// Helper function to calculate credits from output tokens
export function calculateCreditsFromTokens(outputTokens: number, model: string): number {
  const creditCostPer1k = MODEL_CREDIT_COSTS[model] ?? MODEL_CREDIT_COSTS.default;
  return Math.ceil((outputTokens / 1000) * creditCostPer1k);
}
