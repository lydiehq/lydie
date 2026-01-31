import { ArrowClockwiseRegular, ErrorCircleRegular } from "@fluentui/react-icons";
import { Button } from "@lydie/ui/components/generic/Button";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";

import { Logo } from "@/components/layout/Logo";
import { authClient } from "@/utils/auth";

interface ErrorPageProps {
  error: Error;
  reset?: () => void;
}

export function ErrorPage({ error, reset }: ErrorPageProps) {
  const router = useRouter();
  const isDev = import.meta.env.DEV;

  if (isDev) {
    console.error("Route Error:", error);
    console.error("Error details:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause,
    });
  }

  const handleReload = () => {
    if (reset) {
      reset();
    } else {
      window.location.reload();
    }
  };

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const signOut = async () => {
    await authClient.signOut();
    queryClient.removeQueries({
      queryKey: ["auth", "getSession"],
    });
    await router.invalidate();
    navigate({ to: "/auth" });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-4">
      <div className="flex flex-col gap-y-4 items-center max-w-md text-center">
        <div className="flex items-center gap-3">
          <Logo className="size-8 text-gray-400" />
          <ErrorCircleRegular className="size-8 text-red-500" />
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Something went wrong
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {isDev
              ? error.message || "An unexpected error occurred"
              : "We encountered an unexpected error. Please try again."}
          </p>
        </div>

        {isDev && error.stack && (
          <details className="w-full mt-4 text-left">
            <summary className="cursor-pointer text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-2">
              Error details (dev only)
            </summary>
            <pre className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs overflow-auto max-h-64 text-gray-800 dark:text-gray-200">
              {error.stack}
            </pre>
          </details>
        )}

        <div className="flex gap-3 mt-4">
          <Button intent="primary" onPress={handleReload}>
            <ArrowClockwiseRegular className="size-4 mr-2" />
            Reload page
          </Button>
          <Button intent="secondary" onPress={signOut}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
