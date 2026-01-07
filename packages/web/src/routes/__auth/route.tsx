import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ZeroProvider } from "@rocicorp/zero/react";

export const Route = createFileRoute("/__auth")({
  component: RouteComponent,
  beforeLoad: async ({ context }) => {
    if (!context.auth) {
      throw redirect({ to: "/auth" });
    }

    return { ...context, auth: context.auth };
  },
  ssr: false,
});

function RouteComponent() {
  const { zero } = Route.useRouteContext();

  return (
    <ZeroProvider zero={zero}>
      <Outlet />
    </ZeroProvider>
  );
}
