import { queries } from "@lydie/zero/queries";
import { Route } from "@/routes/__auth/w/$organizationSlug/route";
import type { QueryResultType } from "@rocicorp/zero";

export function useOrganization() {
  const { org } = Route.useLoaderData();
  return { organization: formatOrganization(org) };
}

function formatOrganization(
  org: NonNullable<QueryResultType<typeof queries.organizations.bySlug>>
) {
  return {
    ...org,
    subscriptionStatus: org.subscription_status,
    subscriptionPlan: org.subscription_plan,
    polarSubscriptionId: org.polar_subscription_id,
    createdAt: org.created_at,
    updatedAt: org.updated_at,
  };
}
