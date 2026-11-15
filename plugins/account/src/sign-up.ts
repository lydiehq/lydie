import type { AccountApi } from "@lydie/plugin-api";

// What putting this window's workspace in Lydie Cloud is called: a move where the local workspace
// goes away once it is there (this browser's), a copy where it stays (a folder).
export function toCloud(api: Pick<AccountApi, "handoff"> | null | undefined) {
  return api?.handoff?.discard ? "Move to cloud" : "Copy to cloud";
}

// What the sidebar's account entry in a local window says and opens.
export function localEntry(input: {
  signedOut: boolean;
  // `toCloud` of this window.
  toCloud?: string;
  // The window was meant to open a hosted workspace and needs a sign-in for it.
  wanted: boolean;
}): { label: string; opens: "account.signIn" | "account.handoff" } {
  if (input.wanted) return { label: "Sign in to open your workspace", opens: "account.signIn" };
  if (input.signedOut) return { label: "Sign in to Lydie Cloud", opens: "account.signIn" };
  return { label: input.toCloud ?? "Copy to cloud", opens: "account.handoff" };
}
