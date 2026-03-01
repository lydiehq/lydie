import { Button } from "@lydie/ui/components/generic/Button";
import { Heading } from "@lydie/ui/components/generic/Heading";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";

import {
  clearPersistedSessionCache,
  SESSION_QUERY_KEY,
  type ExtendedSessionData,
} from "@/lib/auth/session";
import { authClient } from "@/utils/auth";

export const Route = createFileRoute("/_landing/auth/")({
  component: RouteComponent,
  beforeLoad: ({ context }) => {
    const sessionData = context.auth as ExtendedSessionData | undefined;

    if (!sessionData?.user) {
      return;
    }

    const activeOrganizationSlug = sessionData.session?.activeOrganizationSlug;
    const organizations = sessionData.session?.organizations ?? [];

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

    throw redirect({ to: "/new" });
  },
  validateSearch: z.object({
    redirect: z.string().optional(),
    template: z.string().optional(),
  }),
});

function RouteComponent() {
  return (
    <div className="relative min-h-screen overflow-hidden grainy-gradient-container">
      <div className="relative z-10 flex items-center justify-center min-h-screen p-8 md:p-16">
        <div className="w-full max-w-lg">
          <div className="rounded-2xl border border-black/10 bg-white/85 p-px shadow-xl shadow-black/10 backdrop-blur-sm">
            <div className="size-full rounded-[15px] px-8 py-10 md:px-12 md:py-12">
              <AuthBox />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthBox() {
  const [isPending, setIsPending] = useState(false);
  const { redirect, template } = Route.useSearch();
  const queryClient = useQueryClient();

  useEffect(() => {
    clearPersistedSessionCache();
    queryClient.setQueryData(SESSION_QUERY_KEY, undefined);
  }, [queryClient]);

  const handleGoogleSignIn = async () => {
    setIsPending(true);
    try {
      let callbackURL = window.location.origin;

      if (template) {
        sessionStorage.setItem("pendingTemplateInstall", template);
        callbackURL = window.location.origin;
      } else if (redirect) {
        callbackURL = `${window.location.origin}${redirect}`;
      }

      await authClient.signIn.social({
        provider: "google",
        callbackURL,
      });
    } catch {
      setIsPending(false);
    }
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-y-5">
      <div className="flex flex-col gap-y-2">
        <Heading className="text-zinc-900">Welcome to Lydie</Heading>
        <p className="text-zinc-600">Sign in to your account to continue</p>
      </div>

      <Button
        intent="primary"
        className="w-full flex items-center justify-center gap-3 py-3"
        onPress={handleGoogleSignIn}
        isPending={isPending}
        size="lg"
      >
        <img src="/icons/google.svg" alt="Google" className="size-4 mr-2" />
        <span>Continue with Google</span>
      </Button>
    </div>
  );
}
