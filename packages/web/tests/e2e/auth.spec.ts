import { db, sessionsTable } from "@lydie/database";
import { eq } from "drizzle-orm";

import { expect, test, testUnauthenticated } from "./fixtures/auth.fixture";
import { createExpiredSession, deleteSessionFromDB, setSessionCookie } from "./utils/auth";

function hasResolvedSessionData(rawCache: string | null): boolean {
  if (!rawCache) {
    return false;
  }

  let parsed: {
    clientState?: {
      queries?: Array<{
        queryKey?: unknown[];
        state?: { data?: unknown; status?: string };
      }>;
    };
  };

  try {
    parsed = JSON.parse(rawCache) as {
      clientState?: {
        queries?: Array<{
          queryKey?: unknown[];
          state?: { data?: unknown; status?: string };
        }>;
      };
    };
  } catch {
    return false;
  }

  const sessionQuery = parsed.clientState?.queries?.find(
    (query) => query.queryKey?.[0] === "auth" && query.queryKey?.[1] === "getSession",
  );

  if (!sessionQuery) {
    return false;
  }

  return sessionQuery.state?.status === "success" && sessionQuery.state?.data != null;
}

testUnauthenticated("should not allow unauthed workspace access", async ({ page }) => {
  await page.goto("/w/test-org-slug");
  await page.waitForURL(/\/auth/);
});

test.describe("workspace auth", () => {
  test("authed users should not be able to access auth route", async ({ page, organization }) => {
    await page.goto("/auth");
    await page.waitForURL(`/w/${organization.slug}`);
  });

  test("authenticated users should be be redirected to workspace if accessing root", async ({
    page,
    organization,
  }) => {
    await page.goto("/");
    await page.waitForURL(`/w/${organization.slug}`);
    await expect(page.getByRole("button", { name: organization.name }).first()).toBeVisible();
  });

  test("should logout and redirect to /auth when signing out", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`);
    await page.waitForURL(`/w/${organization.slug}`);
    await page.getByRole("button", { name: organization.name }).first().click();

    await page.getByRole("menuitem", { name: "Sign out" }).click();

    await page.waitForURL(/\/auth/);
  });

  test("should clear session from localStorage on logout", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`);
    await page.waitForURL(`/w/${organization.slug}`);
    await page.getByRole("button", { name: organization.name }).first().click();

    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL(/\/auth/);

    // Verify there is no resolved authenticated session cache
    const cached = await page.evaluate(() => {
      return localStorage.getItem("lydie:query:cache:session");
    });

    expect(hasResolvedSessionData(cached)).toBe(false);
  });
});

test.describe("session persistence", () => {
  test("session should persist across page reload via localStorage cache", async ({
    page,
    organization,
    user,
  }) => {
    await page.goto(`/w/${organization.slug}`);
    await page.waitForURL(`/w/${organization.slug}`);

    // Verify welcome message is visible
    await expect(page.getByText(`Welcome back, ${user.name.split(" ")[0]}!`)).toBeVisible();

    // Reload the page
    await page.reload();

    // Should still be authenticated without needing to re-login
    await page.waitForURL(`/w/${organization.slug}`);
    await expect(page.getByText(`Welcome back, ${user.name.split(" ")[0]}!`)).toBeVisible();
  });

  test("session should be cached in localStorage", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`);
    await page.waitForURL(`/w/${organization.slug}`);

    // Verify localStorage contains the cached session
    const cached = await page.evaluate(() => {
      return localStorage.getItem("lydie:query:cache:session");
    });
    expect(cached).toBeTruthy();
    expect(cached).toContain("auth");
    expect(cached).toContain("getSession");
  });

  test("session should persist across multiple tabs", async ({ page, context, organization }) => {
    await page.goto(`/w/${organization.slug}`);
    await page.waitForURL(`/w/${organization.slug}`);

    // Open a new tab in the same context (shares localStorage)
    const tab2 = await context.newPage();
    await tab2.goto(`/w/${organization.slug}`);

    // Verify both pages have loaded the workspace
    await expect(page.getByRole("button", { name: organization.name }).first()).toBeVisible();
    await expect(tab2.getByRole("button", { name: organization.name }).first()).toBeVisible();

    await tab2.close();
  });

  test("auth page should clear stale session cache", async ({ page, organization }) => {
    // First, log in and verify session is cached
    await page.goto(`/w/${organization.slug}`);
    await page.waitForURL(`/w/${organization.slug}`);

    // Verify cache exists
    let cached = await page.evaluate(() => {
      return localStorage.getItem("lydie:query:cache:session");
    });
    expect(cached).toBeTruthy();

    // Navigate to auth page - should clear cache
    await page.goto("/auth");

    // Verify there is no resolved authenticated session cache
    cached = await page.evaluate(() => {
      return localStorage.getItem("lydie:query:cache:session");
    });
    expect(hasResolvedSessionData(cached)).toBe(false);
  });

  test("session should revalidate with staleTime:0 on mount", async ({ page, organization }) => {
    await page.goto(`/w/${organization.slug}`);
    await page.waitForURL(`/w/${organization.slug}`);

    // Wait for any background refetch to complete
    await page.waitForTimeout(500);

    // Verify session is still valid
    await expect(page.getByRole("button", { name: organization.name }).first()).toBeVisible();
  });

  test.fixme("logged out user accessing cached workspace URL should redirect to /auth", async ({
    page,
    context,
    organization,
  }) => {
    // First, log in to establish session cache
    await page.goto(`/w/${organization.slug}`);
    await page.waitForURL(`/w/${organization.slug}`);

    // Verify cache exists
    const cached = await page.evaluate(() => {
      return localStorage.getItem("lydie:query:cache:session");
    });
    expect(cached).toBeTruthy();

    // Clear cookies to simulate logout, but keep localStorage cache
    await context.clearCookies();

    // Open a fresh page in the same context so in-memory query cache is reset
    const freshPage = await context.newPage();
    await freshPage.goto(`/w/${organization.slug}`);

    // Should redirect to auth because the server session is gone
    await freshPage.waitForURL(/\/auth/);
    await freshPage.close();
  });
});

test.describe("session expiration", () => {
  test.fixme("should redirect to /auth when session is expired", async ({
    page,
    user,
    organization,
  }) => {
    await page.goto(`/w/${organization.slug}`);
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.removeItem("lydie:query:cache:session");
    });

    const { sessionId, token, expiresAt } = await createExpiredSession(
      user.id,
      organization.id,
      -1000,
    );

    await setSessionCookie(page, token, expiresAt);

    await page.goto(`/w/${organization.slug}`);
    await page.waitForURL(/\/auth/);

    // Cleanup
    await db.delete(sessionsTable).where(eq(sessionsTable.id, sessionId));
  });

  test("should redirect to /auth when session is revoked on server", async ({
    page,
    user,
    organization,
  }) => {
    const { sessionId, token, expiresAt } = await createExpiredSession(
      user.id,
      organization.id,
      60 * 60 * 1000, // 1 hour, valid session
    );

    await setSessionCookie(page, token, expiresAt);

    // First, verify the session works
    await page.goto(`/w/${organization.slug}`);
    await page.waitForURL(`/w/${organization.slug}`);

    // Revoke the session on the server
    await deleteSessionFromDB(sessionId);

    // Try to access the page again - should redirect to auth
    await page.goto(`/w/${organization.slug}`);
    await page.waitForURL(/\/auth/);
  });
});
