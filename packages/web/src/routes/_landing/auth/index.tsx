import { Button } from "@lydie/ui/components/generic/Button";
import { Heading } from "@lydie/ui/components/generic/Heading";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";

import { authClient } from "@/utils/auth";

export const Route = createFileRoute("/_landing/auth/")({
  component: RouteComponent,
  validateSearch: z.object({
    redirect: z.string().optional(),
    template: z.string().optional(),
  }),
});

const QUERY_CACHE_KEY = "lydie:query:cache:session";
const SESSION_QUERY_KEY = ["auth", "getSession"];

function RouteComponent() {
  return (
    <div className="min-h-screen relative grainy-gradient-container custom-inner-shadow overflow-hidden">
      <div className="relative z-10 flex items-center justify-center min-h-screen p-8 md:p-16">
        <div className="w-full max-w-lg">
          <div className="p-px ring ring-white/20 rounded-[9px] bg-white/10">
            <div className="p-16 size-full rounded-[8px]">
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

  // Clear any stale session cache when visiting auth page
  // This ensures fresh session data after OAuth redirect
  useEffect(() => {
    try {
      localStorage.removeItem(QUERY_CACHE_KEY);
      // Also clear React Query cache to ensure fresh fetch
      // Use setQueryData instead of removeQueries to avoid triggering
      // a refetch that would cause an infinite loop with the root route loader
      queryClient.setQueryData(SESSION_QUERY_KEY, undefined);
    } catch {
      // Ignore errors
    }
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
    <div className="max-w-sm w-full gap-y-4 flex flex-col">
      <div className="flex flex-col gap-y-2">
        <Heading className="text-white">Welcome to Lydie</Heading>
        <p className="text-white/90">Sign in to your account to continue</p>
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

      {/* <div className="text-xs text-gray-500 dark:text-gray-400">
        By continuing, you agree to our Terms of Service and Privacy Policy
      </div> */}
    </div>
  );
}
