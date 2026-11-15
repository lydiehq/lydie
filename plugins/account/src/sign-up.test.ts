import { describe, expect, test } from "bun:test";

import { authMessage, providerMessage } from "./format.ts";
import { localEntry } from "./sign-up.ts";

const apiError = (fields: { code?: string; kind?: string; status?: number }) =>
  Object.assign(new Error("failed"), fields);

describe("the local window's account entry", () => {
  test("signed out: sign in to Lydie Cloud", () => {
    expect(localEntry({ signedOut: true, wanted: false })).toEqual({
      label: "Sign in to Lydie Cloud",
      opens: "account.signIn",
    });
  });

  test("a window that needs a sign-in for its workspace asks for it", () => {
    expect(localEntry({ signedOut: true, wanted: true })).toEqual({
      label: "Sign in to open your workspace",
      opens: "account.signIn",
    });
  });

  test("signed in: copy this workspace to the cloud", () => {
    expect(localEntry({ signedOut: false, wanted: false })).toEqual({
      label: "Copy to cloud",
      opens: "account.handoff",
    });
    // This browser's workspace does not stay behind.
    expect(localEntry({ signedOut: false, wanted: false, toCloud: "Move to cloud" }).label).toBe(
      "Move to cloud",
    );
  });
});

describe("messages", () => {
  test("a refused sign-up says so in plain words", () => {
    expect(authMessage(apiError({ code: "sign_up_closed", status: 403 }), "sign-up")).toBe(
      "An account cannot be created for this email right now. Try again later.",
    );
    expect(providerMessage("signup_disabled")).toContain("could not be created");
  });
});
