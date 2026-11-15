import { useAccount, useHostedQuery } from "@lydie/plugin-api";
import type { AccountApi } from "@lydie/plugin-api";

// "open": anyone can create an account. "waitlist": cloud accounts are opening gradually, so a
// signed-out window offers to join the cloud waitlist; people whose email was approved create
// their account through the usual sign-up, and existing accounts sign in as before.
export type SignUpMode = "open" | "waitlist";

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
  signUp: SignUpMode;
}): { label: string; opens: "account.waitlist" | "account.signIn" | "account.handoff" } {
  if (input.wanted) return { label: "Sign in to open your workspace", opens: "account.signIn" };
  if (input.signedOut && input.signUp === "waitlist") {
    return { label: "Join the cloud waitlist", opens: "account.waitlist" };
  }
  if (input.signedOut) return { label: "Sign in to Lydie Cloud", opens: "account.signIn" };
  return { label: input.toCloud ?? "Copy to cloud", opens: "account.handoff" };
}

// Asked from the server while signed out. Until it answers, or when it cannot be reached, reads as
// "waitlist", the cautious choice: joining needs no account, and "Sign in" stays available.
export function useSignUpMode(): SignUpMode {
  const { api, state } = useAccount();
  const query = useHostedQuery("waitlist.status", api && state.status === "signed-out" ? {} : null);
  return query.data?.signUp === "open" ? "open" : "waitlist";
}
