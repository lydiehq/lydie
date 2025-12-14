import { ZeroInit } from "@/components/zero/ZeroInit";
import {
  CatchBoundary,
  createFileRoute,
  Outlet,
  redirect,
} from "@tanstack/react-router";

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
  const { auth } = Route.useRouteContext();
  return (
    <CatchBoundary
      getResetKey={() => "auth"}
      errorComponent={({ error }) => (
        <div>
          Error
          {error.name}
          <pre>{error.message}</pre>
          <pre>{error.stack}</pre>
          {/* @ts-ignore */}
          <pre>{error.cause}</pre>
        </div>
      )}
    >
      <ZeroInit session={auth.session}>
        <Outlet />
      </ZeroInit>
    </CatchBoundary>
  );
}
