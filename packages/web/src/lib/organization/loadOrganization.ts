import type { Zero } from "@rocicorp/zero";
import type { QueryResultType } from "@rocicorp/zero";
import type { QueryClient } from "@tanstack/react-query";

import { queries } from "@lydie/zero/queries";

const STALE_TIME = 5 * 60 * 1000;

type OrganizationQueryResult = NonNullable<QueryResultType<typeof queries.organizations.bySlug>>;

export type Organization = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
  polarSubscriptionId: string | null;
  createdAt: number;
  updatedAt: number;
  [key: string]: any;
};

function formatOrganization(org: OrganizationQueryResult): Organization {
  return {
    ...org,
    subscriptionStatus: org.subscription_status,
    subscriptionPlan: org.subscription_plan,
    polarSubscriptionId: org.polar_subscription_id,
    createdAt: org.created_at,
    updatedAt: org.updated_at,
  };
}

async function fetchOrganization(zero: Zero, organizationSlug: string) {
  const org = await zero.run(queries.organizations.bySlug({ organizationSlug }), {
    type: "complete",
    ttl: "10m",
  });

  if (!org) {
    throw new Error(`Organization not found: ${organizationSlug}`);
  }

  return formatOrganization(org);
}

function getOrganizationQueryKey(organizationSlug: string) {
  return ["organization", organizationSlug];
}

export async function loadOrganization(
  queryClient: QueryClient,
  zero: Zero,
  organizationSlug: string,
): Promise<Organization> {
  return await queryClient.ensureQueryData({
    queryKey: getOrganizationQueryKey(organizationSlug),
    queryFn: () => fetchOrganization(zero, organizationSlug),
    staleTime: STALE_TIME,
  });
}
