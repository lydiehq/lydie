import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import { initPostHog, identifyUser, resetUser, trackEvent } from "@/lib/posthog";
import type { PostHog } from "posthog-js";

interface PostHogContextValue {
  posthog: PostHog | null;
  identify: typeof identifyUser;
  reset: typeof resetUser;
  track: typeof trackEvent;
}

const PostHogContext = createContext<PostHogContextValue | null>(null);

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Initialize PostHog on mount
    const posthogInstance = initPostHog();
    
    return () => {
      // Cleanup on unmount if needed
    };
  }, []);

  const value: PostHogContextValue = {
    posthog: null, // Will be available through the posthog singleton
    identify: identifyUser,
    reset: resetUser,
    track: trackEvent,
  };

  return (
    <PostHogContext.Provider value={value}>
      {children}
    </PostHogContext.Provider>
  );
}

export function usePostHog() {
  const context = useContext(PostHogContext);
  
  if (!context) {
    throw new Error("usePostHog must be used within PostHogProvider");
  }
  
  return context;
}
