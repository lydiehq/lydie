import { useParams } from "@tanstack/react-router";
import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@lydie/zero/queries";
import { useAuth } from "./auth.context";
import { useMemo } from "react";

export function useOrganization() {
  const { organizationId } = useParams({ from: "/__auth/w/$organizationId" });
  const { session } = useAuth();
  const [org] = useQuery(queries.organizations.byId({ organizationId }));
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
