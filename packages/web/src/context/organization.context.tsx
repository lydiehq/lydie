import { useParams } from "@tanstack/react-router";
import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@lydie/zero/queries";
import { useMemo } from "react";

export function useOrganization() {
  const { organizationSlug } = useParams({
    from: "/__auth/w/$organizationSlug",
  });
  const [org] = useQuery(queries.organizations.bySlug({ organizationSlug }));
  const organization = useMemo(() => {
    if (!org) return undefined;

    return {
      ...org,
      subscriptionStatus: org.subscription_status,
      subscriptionPlan: org.subscription_plan,
      polarSubscriptionId: org.polar_subscription_id,
      createdAt: org.created_at,
      updatedAt: org.updated_at,
    };
  }, [org]);

  return { organization };
}
