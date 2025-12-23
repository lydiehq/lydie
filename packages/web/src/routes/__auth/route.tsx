import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/__auth")({
  component: RouteComponent,
  beforeLoad: async ({ context }) => {
    if (!context.auth) {
      throw redirect({ to: "/auth" });
    }
    return { ...context, auth: context.auth };
  },
  ssr: false,
  gcTime: Infinity,
  staleTime: Infinity,
});

function RouteComponent() {
  return <Outlet />;
}
