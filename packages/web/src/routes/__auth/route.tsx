import { schema } from "@lydie/zero/schema";
import { Zero } from "@rocicorp/zero";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { mutators } from "@lydie/zero/mutators";
import { ZeroProvider } from "@rocicorp/zero/react";
import type { RouterContext } from "@/main";

let _zeroInstance: Zero | undefined;

function getZeroInstance(context: RouterContext) {
  console.log("Getting zero instance");
  if (!_zeroInstance) {
    _zeroInstance = new Zero({
      userID: context.auth.session.userId,
      schema,
      cacheURL: import.meta.env.VITE_ZERO_URL,
      mutators,
      context: context.auth.session,
    });
  }
  return _zeroInstance;
}

export const Route = createFileRoute("/__auth")({
  component: RouteComponent,
  beforeLoad: async ({ context }) => {
    if (!context.auth) {
      throw redirect({ to: "/auth" });
    }

    const zeroInstance = getZeroInstance(context);

    return { ...context, auth: context.auth, zero: zeroInstance };
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
