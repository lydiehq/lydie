import posthog from "posthog-js";

// Check if we should enable PostHog (always disabled in development)
const shouldEnablePostHog = () => {
  return !import.meta.env.DEV;
};

export const initPostHog = () => {
  const apiKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
  const apiHost =
    import.meta.env.VITE_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";

  if (!apiKey) {
    return null;
  }

  // Disable PostHog in development
  if (!shouldEnablePostHog()) {
    return null;
  }

  posthog.init(apiKey, {
    api_host: apiHost,
    person_profiles: "identified_only",
    capture_pageview: false, // We'll handle this manually for SPA routing
    capture_pageleave: true,
    autocapture: false, // Disable autocapture for more control
    disable_session_recording: false,
    persistence: "localStorage",
  });

  return posthog;
};

export const identifyUser = (
  userId: string,
  properties?: {
    email?: string;
    organizationId?: string;
    organizationSlug?: string;
    role?: string;
    [key: string]: string | number | boolean | undefined;
  }
) => {
  if (!shouldEnablePostHog() || !posthog.__loaded) {
    return;
  }

  posthog.identify(userId, properties);
};

export const resetUser = () => {
  if (!posthog.__loaded) {
    return;
  }

  posthog.reset();
};

export const trackEvent = (
  eventName: string,
  properties?: Record<string, string | number | boolean | null | undefined>
) => {
  if (!shouldEnablePostHog() || !posthog.__loaded) {
    return;
  }

  posthog.capture(eventName, properties);
};

export const setUserProperties = (
  properties: Record<string, string | number | boolean | null | undefined>
) => {
  if (!posthog.__loaded) {
    return;
  }

  posthog.setPersonProperties(properties);
};

export { posthog };
