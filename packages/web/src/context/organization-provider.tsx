import type { ReactNode } from "react";
import { createContext, useContext } from "react";

// Organization context for synchronous access to current organization
// This is set by the $organizationSlug route and available to all child routes
const OrganizationContext = createContext<any>(null);

export function OrganizationProvider({ 
  children, 
  organization 
}: { 
  children: ReactNode; 
  organization: any;
}) {
  return (
    <OrganizationContext.Provider value={organization}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganizationContext() {
  const organization = useContext(OrganizationContext);
  
  if (!organization) {
    throw new Error(
      "useOrganizationContext must be used within OrganizationProvider. " +
      "Make sure you're rendering inside a $organizationSlug route."
    );
  }
  
  return organization;
}
