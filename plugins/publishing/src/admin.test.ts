import { describe, expect, test } from "bun:test";

import { adminIn } from "./admin.ts";

const user = { id: "u1", email: "maya@example.com", name: "Maya", image: null };
const signedIn = { status: "signed-in" as const, user };
const members = (role: string, isLoading = false) => ({
  data: [
    { userId: "u1", role },
    { userId: "u2", role: "owner" },
  ],
  isLoading,
});

describe("adminIn", () => {
  test("owners and admins only", () => {
    expect(adminIn(members("owner"), signedIn)).toBe(true);
    expect(adminIn(members("admin"), signedIn)).toBe(true);
    expect(adminIn(members("member"), signedIn)).toBe(false);
    expect(adminIn(members("guest"), signedIn)).toBe(false);
  });

  test("unknown while the members load, then false without a row", () => {
    expect(adminIn({ data: [], isLoading: true }, signedIn)).toBeNull();
    expect(adminIn({ data: [], isLoading: false }, signedIn)).toBe(false);
    expect(adminIn(members("admin", true), signedIn)).toBe(true);
  });

  test("signed out is never an admin", () => {
    expect(adminIn(members("owner"), { status: "signed-out" })).toBe(false);
  });

  test("an expired session keeps its role", () => {
    expect(adminIn(members("admin"), { status: "expired", user })).toBe(true);
  });
});
