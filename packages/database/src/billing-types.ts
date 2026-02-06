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
  }
> = {
  [PLAN_TYPES.FREE]: {
    name: "Free",
    price: 0,
    creditsPerSeat: 150,
  },
  [PLAN_TYPES.MONTHLY]: {
    name: "Pro (Monthly)",
    price: 18,
    creditsPerSeat: 4000,
  },
  [PLAN_TYPES.YEARLY]: {
    name: "Pro (Yearly)",
    price: 14, // Effective monthly price ($168/year)
    creditsPerSeat: 4000,
  },
};
