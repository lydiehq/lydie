import { describe, expect, test } from "bun:test";

import { providerMessage } from "./format.ts";
import { localEntry } from "./sign-up.ts";

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
  test("a Google account that could not get an account says so in plain words", () => {
    expect(providerMessage("unable_to_create_user")).toContain("could not create an account");
  });
});
