import { describe, expect, test } from "bun:test";

import { twoFactorMessage } from "./format.ts";
import { setupKey } from "./TwoFactorDialog.tsx";

describe("two-step verification", () => {
  test("the setup key is the URI's secret in groups of four", () => {
    expect(setupKey("otpauth://totp/Lydie:ada%40x.dev?secret=ABCDEFGHIJKLMN&issuer=Lydie")).toBe(
      "ABCD EFGH IJKL MN",
    );
  });

  test("failures in plain words", () => {
    const failure = (code: string) => Object.assign(new Error(code), { code });
    expect(twoFactorMessage(failure("INVALID_CODE"))).toContain("code is not right");
    expect(twoFactorMessage(failure("INVALID_PASSWORD"))).toBe("That password is not right.");
    expect(twoFactorMessage(failure("two_factor_expired"))).toContain("Sign in again");
    expect(twoFactorMessage(failure("ACCOUNT_TEMPORARILY_LOCKED"))).toContain("15 minutes");
  });
});
