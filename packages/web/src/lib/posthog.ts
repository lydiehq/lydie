import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;

const API_HOST = import.meta.env.DEV
  ? "http://localhost:3001/ingest"
  : (import.meta.env.VITE_POSTHOG_HOST || "https://api.lydie.co/ingest");

export function initPostHog() {
  if (!POSTHOG_KEY) {
    console.info("[PostHog] No API key configured, skipping initialization");
    return;
  }

  posthog.init(POSTHOG_KEY, {
    api_host: API_HOST,
    ui_host: "https://us.i.posthog.com",

    person_profiles: "identified_only",
    capture_pageview: false,
    capture_pageleave: false,

    session_recording: {
      maskAllInputs: true,
      maskInputOptions: { password: true },
      maskTextSelector: "[data-private]",
      recordCrossOriginIframes: false,
      recordHeaders: false,
    },

    loaded: () => {
      if (import.meta.env.DEV) {
        console.info("[PostHog] Initialized in development mode");
      }
    },

    opt_out_capturing_by_default: false,
    respect_dnt: true,

    autocapture: false,
    capture_performance: false,
    disable_session_recording: false,
  });

  if (import.meta.env.VITE_POSTHOG_ENABLE_REPLAY !== "true") {
    posthog.stopSessionRecording();
  }
}

export function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>,
) {
  if (!POSTHOG_KEY) return;
  
  posthog.capture(eventName, properties);
}

export function identifyUser(
  userId: string,
  properties?: Record<string, unknown>,
) {
  if (!POSTHOG_KEY) return;
  
  posthog.identify(userId, properties);
}

export function resetUser() {
  if (!POSTHOG_KEY) return;
  
  posthog.reset();
}

export function trackPageView(pageName?: string) {
  if (!POSTHOG_KEY) return;
  
  posthog.capture("$pageview", pageName ? { page: pageName } : undefined);
}

export { posthog };
