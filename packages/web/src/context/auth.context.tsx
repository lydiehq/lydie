import { useRouteContext } from "@tanstack/react-router";

export function useAuth() {
  const ctx = useRouteContext({ strict: false });

  return ctx.auth ?? { session: undefined };
}
