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
    price: number; // Price per seat per month (or effective monthly for yearly)
    creditsPerMonth: number; // Credits per month
    creditsPerSeat: number; // Credits per seat per month
    outputTokenCap: number; // Max output tokens
    maxInternalCost: number; // Max internal cost in dollars
    features: {
      aiAssistant: boolean;
    };
  }
> = {
  [PLAN_TYPES.FREE]: {
    name: "Free",
    price: 0,
    creditsPerMonth: 25,
    creditsPerSeat: 25,
    outputTokenCap: 25_000,
    maxInternalCost: 0.35,
    features: {
      aiAssistant: true,
    },
  },
  [PLAN_TYPES.MONTHLY]: {
    name: "Pro (Monthly)",
    price: 18,
    creditsPerMonth: 800,
    creditsPerSeat: 800,
    outputTokenCap: 800_000,
    maxInternalCost: 11.2,
    features: {
      aiAssistant: true,
    },
  },
  [PLAN_TYPES.YEARLY]: {
    name: "Pro (Yearly)",
    price: 14, // Effective monthly price ($168/year)
    creditsPerMonth: 650,
    creditsPerSeat: 650,
    outputTokenCap: 650_000,
    maxInternalCost: 9.1,
    features: {
      aiAssistant: true,
    },
  },
};

// Credit costs per model (credits per 1k output tokens)
// Adjust these based on your actual LLM costs and desired margins
export const MODEL_CREDIT_COSTS: Record<string, number> = {
  "gpt-4o": 10, // 10 credits per 1k output tokens
  "gpt-4o-mini": 5, // 5 credits per 1k output tokens
  "gpt-5": 10, // 10 credits per 1k output tokens
  "gpt-5-mini": 5, // 5 credits per 1k output tokens
  "gpt-5.2": 10, // 10 credits per 1k output tokens
  "gemini-2.0-flash": 3, // 3 credits per 1k output tokens
  "gemini-2.5-flash": 3, // 3 credits per 1k output tokens
  "gemini-2.5-flash-lite": 2, // 2 credits per 1k output tokens
  default: 5, // Default fallback
};

// Helper function to calculate credits from output tokens
export function calculateCreditsFromTokens(outputTokens: number, model: string): number {
  const creditCostPer1k = MODEL_CREDIT_COSTS[model] || MODEL_CREDIT_COSTS.default;
  return Math.ceil((outputTokens / 1000) * creditCostPer1k);
}
