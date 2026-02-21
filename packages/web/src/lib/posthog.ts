import posthog from "posthog-js";

const POSTHOG_RECORDING_ENABLED = false;

export function initPostHog() {
  if (!POSTHOG_RECORDING_ENABLED) return;
}

export function trackEvent(eventName: string, properties?: Record<string, unknown>) {
  if (!POSTHOG_RECORDING_ENABLED) return;

  posthog.capture(eventName, properties);
}

export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  if (!POSTHOG_RECORDING_ENABLED) return;

  posthog.identify(userId, properties);
}

export function resetUser() {
  if (!POSTHOG_RECORDING_ENABLED) return;

  posthog.reset();
}

export function trackPageView(pageName?: string) {
  if (!POSTHOG_RECORDING_ENABLED) return;

  posthog.capture("$pageview", pageName ? { page: pageName } : undefined);
}

export { posthog };
