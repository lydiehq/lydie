import { describe, expect, it } from "vitest";

import type { ExtendedSessionData } from "@/lib/auth/session";

import { resolveOrganizationRecovery } from "./organization-recovery";

function createSession(
  organizations: Array<{ id: string; slug: string }>,
  activeOrganizationSlug?: string,
): ExtendedSessionData["session"] {
  return {
    organizations: organizations.map((organization) => ({
      id: organization.id,
      name: organization.slug,
      slug: organization.slug,
    })),
    activeOrganizationSlug,
  };
}

describe("resolveOrganizationRecovery", () => {
  it("redirects to workspace creation when session has no organizations", () => {
    const decision = resolveOrganizationRecovery("missing-org", createSession([]));

    expect(decision).toEqual({ type: "redirect-new" });
  });

  it("redirects to active organization when requested slug is stale", () => {
    const decision = resolveOrganizationRecovery(
      "missing-org",
      createSession(
        [
          { id: "org-1", slug: "alpha" },
          { id: "org-2", slug: "beta" },
        ],
        "beta",
      ),
    );

    expect(decision).toEqual({
      type: "redirect-workspace",
      organizationSlug: "beta",
    });
  });

  it("falls back to first organization when active slug is missing", () => {
    const decision = resolveOrganizationRecovery(
      "missing-org",
      createSession(
        [
          { id: "org-1", slug: "alpha" },
          { id: "org-2", slug: "beta" },
        ],
        "orphaned-slug",
      ),
    );

    expect(decision).toEqual({
      type: "redirect-workspace",
      organizationSlug: "alpha",
    });
  });

  it("keeps not-found when requested slug is still the only valid workspace", () => {
    const decision = resolveOrganizationRecovery(
      "alpha",
      createSession([{ id: "org-1", slug: "alpha" }], "alpha"),
    );

    expect(decision).toEqual({ type: "not-found" });
  });
});
