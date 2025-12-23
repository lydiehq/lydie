import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@lydie/zero/queries";
import { useMemo } from "react";

type OrganizationContextValue = {
  organizationId: string;
  organization:
    | {
        id: string;
        name: string;
        slug: string | null;
        subscriptionStatus: string | null;
        subscriptionPlan: string | null;
        polarSubscriptionId: string | null;
        createdAt: number;
        updatedAt: number;
      }
    | undefined;
};

const OrganizationContext = createContext<OrganizationContextValue | null>(
  null
);

type Props = {
  organizationId: string;
  children: ReactNode;
};

export function OrganizationProvider({ organizationId, children }: Props) {
  const [org] = useQuery(queries.organizations.byId({ organizationId }));

  const organization = useMemo(() => {
    if (!org) return undefined;

    return {
      ...org,
      id: org.id,
      name: org.name,
      slug: org.slug,
      subscriptionStatus: org.subscription_status,
      subscriptionPlan: org.subscription_plan,
      polarSubscriptionId: org.polar_subscription_id,
      createdAt: org.created_at,
      updatedAt: org.updated_at,
    };
  }, [org]);

  return (
    <OrganizationContext.Provider value={{ organizationId, organization }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganizationContext() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error(
      "useOrganizationContext must be used within OrganizationProvider"
    );
  }
  return context;
}
