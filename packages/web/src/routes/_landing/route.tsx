import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import "@fontsource-variable/dm-sans";
import type { ExtendedSessionData } from "@/lib/auth/session";

export const Route = createFileRoute("/_landing")({
  component: RouteComponent,
  beforeLoad: ({ context, location }) => {
    if (location.pathname.startsWith("/auth")) {
      return;
    }

    const auth = context.auth as ExtendedSessionData | undefined;

    if (auth?.user) {
      const activeOrganizationSlug = auth.session?.activeOrganizationSlug;
      const organizations = auth.session?.organizations ?? [];

      if (activeOrganizationSlug) {
        throw redirect({
          to: "/w/$organizationSlug",
          params: { organizationSlug: activeOrganizationSlug },
        });
      }

      if (organizations.length > 0) {
        throw redirect({
          to: "/w/$organizationSlug",
          params: { organizationSlug: organizations[0].slug },
        });
      }

      throw redirect({
        to: "/new",
      });
    }
  },
});

function RouteComponent() {
  return <Outlet />;
}
