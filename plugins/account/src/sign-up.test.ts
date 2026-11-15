import { describe, expect, test } from "bun:test";

import { authMessage, isSignUpClosed, providerMessage, waitlistMessage } from "./format.ts";
import { localEntry } from "./sign-up.ts";

const apiError = (fields: { code?: string; kind?: string; status?: number }) =>
  Object.assign(new Error("failed"), fields);

describe("the local window's account entry", () => {
  test("signed out while accounts open gradually: join the cloud waitlist", () => {
    expect(localEntry({ signedOut: true, wanted: false, signUp: "waitlist" })).toEqual({
      label: "Join the cloud waitlist",
      opens: "account.waitlist",
    });
  });

  test("signed out with open sign-up: sign in to Lydie Cloud", () => {
    expect(localEntry({ signedOut: true, wanted: false, signUp: "open" })).toEqual({
      label: "Sign in to Lydie Cloud",
      opens: "account.signIn",
    });
  });

  test("a window that needs a sign-in for its workspace asks for it either way", () => {
    for (const signUp of ["open", "waitlist"] as const) {
      expect(localEntry({ signedOut: true, wanted: true, signUp }).opens).toBe("account.signIn");
    }
  });

  test("signed in: copy this workspace to the cloud", () => {
    expect(localEntry({ signedOut: false, wanted: false, signUp: "waitlist" })).toEqual({
      label: "Copy to cloud",
      opens: "account.handoff",
    });
    // This browser's workspace does not stay behind.
    expect(
      localEntry({ signedOut: false, wanted: false, signUp: "open", toCloud: "Move to cloud" })
        .label,
    ).toBe("Move to cloud");
  });
});

describe("messages", () => {
  test("a closed sign-up is recognised from the API and from a provider's code", () => {
    expect(isSignUpClosed(apiError({ code: "sign_up_closed", status: 403 }))).toBe(true);
    expect(isSignUpClosed("signup_disabled")).toBe(true);
    expect(isSignUpClosed(apiError({ code: "rate_limited" }))).toBe(false);
    expect(isSignUpClosed(null)).toBe(false);
  });

  test("a refused sign-up points to the waitlist", () => {
    expect(authMessage(apiError({ code: "sign_up_closed", status: 403 }), "sign-up")).toContain(
      "waitlist",
    );
    expect(providerMessage("signup_disabled")).toContain("waitlist");
  });

  test("joining the waitlist explains what went wrong", () => {
    expect(waitlistMessage(apiError({ code: "invalid_input", kind: "client" }))).toBe(
      "Enter a valid email address.",
    );
    expect(waitlistMessage(apiError({ code: "rate_limited", kind: "server" }))).toContain(
      "Too many attempts",
    );
    expect(waitlistMessage(apiError({ kind: "network" }))).toContain("cannot reach the server");
  });
});
