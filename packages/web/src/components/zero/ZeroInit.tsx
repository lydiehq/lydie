import { useZero as _useZero, ZeroProvider } from "@rocicorp/zero/react";
import { mutators } from "@lydie/zero/mutators";
import { schema } from "@lydie/zero/schema";
import { Zero } from "@rocicorp/zero";
import { useCallback, useMemo, useRef, useEffect } from "react";
import { useParams, useRouter, useRouteContext } from "@tanstack/react-router";
import type { Session } from "better-auth";
import { queries } from "@lydie/zero/queries";

type Props = {
  children: React.ReactNode;
  session: Session | undefined;
};

function getOrCreateTrialUserId(): string {
  const TRIAL_USER_KEY = "lydie:trial-user-id";
  let trialUserId = localStorage.getItem(TRIAL_USER_KEY);

  if (!trialUserId) {
    trialUserId = `trial-${crypto.randomUUID()}`;
    localStorage.setItem(TRIAL_USER_KEY, trialUserId);
  }

  return trialUserId;
}

export function ZeroInit({ children, session }: Props) {
  const router = useRouter();
  const params = useParams({ strict: false });
  const hasInitialized = useRef(false);

  const init = useCallback(
    (zero: Zero) => {
      // Only update router context if this is a new Zero instance
      // This prevents infinite loops when router.invalidate() causes re-renders
      if (hasInitialized.current) return;
      hasInitialized.current = true;

      router.update({
        context: {
          ...router.options.context,
          zero,
        },
      });
      router.invalidate();

      if (params.organizationId) {
        preload(zero, params.organizationId);
      }
    },
    [router, params.organizationId]
  );

  // Determine if user is in trial mode
  const isTrial = !session;

  // Memoize cacheURL to prevent unnecessary re-initializations
  const cacheURL = useMemo(
    () => (isTrial ? null : import.meta.env.VITE_ZERO_URL),
    [isTrial]
  );

  // Memoize userID to prevent unnecessary re-initializations
  const userID = useMemo(
    () => session?.userId ?? getOrCreateTrialUserId(),
    [session?.userId]
  );

  // Memoize context object to prevent creating new object on every render
  const context = useMemo(() => {
    if (isTrial) {
      return { isTrial: true } as any;
    }
    return session;
  }, [isTrial, session]);

  return (
    <ZeroProvider {...{ schema, userID, context, cacheURL, mutators, init }}>
      {children}
    </ZeroProvider>
  );
}

function preload(zero: Zero, organizationId: string) {
  // Don't preload for local organization
  if (organizationId === "local") {
    return;
  }
  zero.preload(queries.organizations.documentsAndFolders({ organizationId }));
}
