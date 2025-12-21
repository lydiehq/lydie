import { Button } from "@/components/generic/Button";
import { Heading } from "@/components/generic/Heading";
import { Logo } from "@/components/layout/Logo";
import { authClient } from "@/utils/auth";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { useState } from "react";

export const Route = createFileRoute("/_landing/auth/")({
  component: RouteComponent,
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
});

function RouteComponent() {
  return (
    <div className="min-h-screen bg-white flex">
      <div className="flex items-center justify-center bg-white p-16 w-[50vw]">
        <AuthBox />
      </div>
      <div className="flex h-screen relative">
        <div className="h-full w-px bg-black/10" />
        <div className="rounded-full p-1.5 absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 bg-white">
          <Logo className="size-6 text-gray-200" />
        </div>
      </div>
      <div className="grow pl-20">
        {/* <div className="rounded-2xl border border-lime-800/12 p-3 flex w-auto md:absolute inset-y-[5%] gradient-bg">
          <img
            src="/screenshot_sidebar.png"
            height={1600}
            width={2360}
            className="rounded-lg aspect-2360/1600 object-fit w-4xl shrink-0 ring-1 ring-black/2 relative z-10 shadow-legit"
          />
        </div> */}
      </div>
    </div>
  );
}

function AuthBox() {
  const [isPending, setIsPending] = useState(false);
  const { redirect } = Route.useSearch();

  const handleGoogleSignIn = async () => {
    setIsPending(true);
    try {
      const callbackURL = redirect
        ? `${window.location.origin}${redirect}`
        : window.location.origin;
      await authClient.signIn.social({
        provider: "google",
        callbackURL,
      });
    } catch (error) {
      setIsPending(false);
    }
  };

  return (
    <div className="max-w-sm w-full gap-y-4 flex flex-col">
      <div className="flex flex-col gap-y-2">
        <Heading>Welcome to Lydie</Heading>
        <p className="text-gray-600 dark:text-gray-400">
          Sign in to your account to continue
        </p>
      </div>

      <Button
        intent="secondary"
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
