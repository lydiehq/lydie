import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import "@fontsource-variable/dm-sans";
import type { ExtendedSessionData } from "@/lib/auth/session";

export const Route = createFileRoute("/_landing")({
  component: RouteComponent,
  beforeLoad: ({ context }) => {
    const auth = context.auth as ExtendedSessionData | undefined;

    if (auth) {
      const activeOrganizationSlug = auth.session?.activeOrganizationSlug;
      const organizations = auth.session?.organizations ?? [];

      // Redirect to active organization if set
      if (activeOrganizationSlug) {
        throw redirect({
          to: "/w/$organizationSlug",
          params: { organizationSlug: activeOrganizationSlug },
        });
      }

      // Redirect to first organization if user has any
      if (organizations.length > 0) {
        throw redirect({
          to: "/w/$organizationSlug",
          params: { organizationSlug: organizations[0].slug },
        });
      }

      // No organizations, redirect to create workspace
      throw redirect({
        to: "/new",
      });
    }
  },
});

function RouteComponent() {
  return <Outlet />;
}
