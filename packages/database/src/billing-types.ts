export const PLAN_TYPES = {
	FREE: "free",
	PRO: "pro",
} as const

export type PlanType = (typeof PLAN_TYPES)[keyof typeof PLAN_TYPES]

export const PLAN_LIMITS: Record<
	PlanType,
	{
		name: string
		maxTokensPerPeriod: number | null
		maxRequestsPerPeriod: number | null
		maxMessagesPerDay: number | null
		features: {
			documentChat: boolean
			assistantChat: boolean
		}
		price: {
			monthly: number | null
			yearly: number | null
		}
	}
> = {
	[PLAN_TYPES.FREE]: {
		name: "Free",
		maxTokensPerPeriod: 100_000,
		maxRequestsPerPeriod: 50,
		maxMessagesPerDay: 10,
		features: {
			documentChat: true,
			assistantChat: true,
		},
		price: {
			monthly: 0,
			yearly: 0,
		},
	},
	[PLAN_TYPES.PRO]: {
		name: "Pro",
		maxTokensPerPeriod: null,
		maxRequestsPerPeriod: null,
		maxMessagesPerDay: null,
		features: {
			documentChat: true,
			assistantChat: true,
		},
		price: {
			monthly: 2000,
			yearly: 20000,
		},
	},
}
