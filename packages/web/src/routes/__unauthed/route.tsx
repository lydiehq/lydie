import { createFileRoute, Outlet } from "@tanstack/react-router";
import { OrganizationProvider } from "@/context/organization-provider";
import { LOCAL_ORG_ID } from "@/lib/local-organization";

export const Route = createFileRoute("/__unauthed")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <OrganizationProvider organizationId={LOCAL_ORG_ID}>
      <Outlet />
    </OrganizationProvider>
  );
}

