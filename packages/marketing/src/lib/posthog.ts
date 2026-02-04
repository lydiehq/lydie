import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.PUBLIC_POSTHOG_KEY;

const API_HOST = import.meta.env.DEV
  ? "http://localhost:3001/ingest"
  : "https://api.lydie.co/ingest";

let initialized = false;

export function initPostHog() {
  if (initialized || !POSTHOG_KEY) {
    return;
  }

  posthog.init(POSTHOG_KEY, {
    api_host: API_HOST,
    ui_host: "https://us.i.posthog.com",

    capture_pageview: true,
    capture_pageleave: false,

    session_recording: { maskAllInputs: true },
    disable_session_recording: true,

    respect_dnt: true,
    opt_out_capturing_by_default: false,

    autocapture: {
      dom_event_allowlist: [],
      url_allowlist: [],
      element_allowlist: [],
      css_selector_allowlist: ["[data-ph-capture]"],
    },

    capture_performance: false,

    loaded: (posthog) => {
      if (import.meta.env.DEV) {
        console.info("[PostHog Marketing] Initialized");
      }
    },
  });

  initialized = true;
}

export function trackMarketingEvent(eventName: string, properties?: Record<string, unknown>) {
  if (!POSTHOG_KEY) return;

  posthog.capture(eventName, properties);
}

export { posthog };
