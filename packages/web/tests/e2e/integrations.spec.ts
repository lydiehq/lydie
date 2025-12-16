import { test, expect } from "./fixtures/auth.fixture";
import {
  db,
  integrationConnectionsTable,
  integrationLinksTable,
} from "@lydie/database";
import { eq } from "drizzle-orm";
import type { Route } from "@playwright/test";

test.describe("Integrations", () => {
  test.describe("GitHub Connection Flow", () => {
    test("should open connection dialog and show integration options", async ({
      page,
      organization,
    }) => {
      await page.goto(`/w/${organization.id}/settings/integrations`);

      // Should show the "Add Connection" button
      await expect(
        page.getByRole("button", { name: "Add Connection" })
      ).toBeVisible();

      // Click to open dialog
      await page.getByRole("button", { name: "Add Connection" }).click();

      // Should show GitHub option
      await expect(page.getByText("GitHub")).toBeVisible();
      await expect(
        page.getByText(
          "Sync documents as Markdown files to a GitHub repository"
        )
      ).toBeVisible();

      // Should show coming soon options (disabled)
      await expect(page.getByText("Shopify Blog")).toBeVisible();
      await expect(page.getByText("WordPress")).toBeVisible();
      await expect(page.getByText("Coming Soon")).toHaveCount(2);
    });

    test("should initiate GitHub OAuth flow when connecting", async ({
      page,
      organization,
    }) => {
      // Mock the OAuth authorize endpoint
      await page.route(
        "**/internal/integrations/github/oauth/authorize",
        async (route: Route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              authUrl:
                "https://github.com/login/oauth/authorize?client_id=test&redirect_uri=http://localhost:3000/oauth/callback&scope=repo&state=test-state",
            }),
          });
        }
      );

      let oauthRedirectAttempted = false;
      // Intercept the redirect to GitHub
      await page.route(
        "https://github.com/login/oauth/authorize*",
        async (route: Route) => {
          oauthRedirectAttempted = true;
          // Don't actually redirect, just capture that it was attempted
          await route.abort();
        }
      );

      await page.goto(`/w/${organization.id}/settings/integrations`);
      await page.getByRole("button", { name: "Add Connection" }).click();

      // Select GitHub
      await page.getByText("GitHub").click();

      // Should show GitHub configuration form
      await expect(page.getByText("Connect GitHub")).toBeVisible();
      await expect(page.getByText("Authorize with GitHub OAuth")).toBeVisible();

      // Click connect button
      await page.getByRole("button", { name: /Connect with GitHub/i }).click();

      // Should attempt to redirect to GitHub OAuth (we intercepted it)
      await page.waitForTimeout(1000);
      expect(oauthRedirectAttempted).toBe(true);
    });

    test("should handle successful OAuth callback", async ({
      page,
      organization,
    }) => {
      // Navigate with success query params (simulating OAuth return)
      await page.goto(
        `/w/${organization.id}/settings/integrations?success=true&connectionId=test-connection-123`
      );

      // Should show success toast
      await expect(
        page.getByText("Integration connected successfully!")
      ).toBeVisible();

      // URL should be cleaned up
      await page.waitForTimeout(500);
      const url = new URL(page.url());
      expect(url.searchParams.has("success")).toBe(false);
      expect(url.searchParams.has("connectionId")).toBe(false);
    });

    test("should handle OAuth callback error", async ({
      page,
      organization,
    }) => {
      await page.goto(
        `/w/${organization.id}/settings/integrations?error=access_denied`
      );

      // Should show error toast
      await expect(
        page.getByText(/Failed to connect: access_denied/i)
      ).toBeVisible();

      // URL should be cleaned up
      await page.waitForTimeout(500);
      const url = new URL(page.url());
      expect(url.searchParams.has("error")).toBe(false);
    });
  });

  test.describe("Integration Links", () => {
    test("should show 'no integrations connected' state initially", async ({
      page,
      organization,
    }) => {
      await page.goto(`/w/${organization.id}/settings/integrations`);

      await expect(
        page.getByText("No integrations connected yet")
      ).toBeVisible();
      await expect(
        page.getByText(
          "Connect your first integration to start syncing documents"
        )
      ).toBeVisible();
    });

    test("should allow creating a link after connection exists", async ({
      page,
      organization,
    }) => {
      // Create a test GitHub connection directly in DB
      const [connection] = await db
        .insert(integrationConnectionsTable)
        .values({
          integrationType: "github",
          organizationId: organization.id,
          config: {
            accessToken: "test-token",
            owner: "test-owner",
            branch: "main",
          },
          enabled: true,
        })
        .returning();

      // Mock the resources endpoint
      await page.route(
        `**/internal/integrations/${connection.id}/resources`,
        async (route: Route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              resources: [
                {
                  id: "test-owner/test-repo",
                  name: "test-repo",
                  fullName: "test-owner/test-repo",
                  metadata: {
                    defaultBranch: "main",
                  },
                },
                {
                  id: "test-owner/docs-repo",
                  name: "docs-repo",
                  fullName: "test-owner/docs-repo",
                  metadata: {
                    defaultBranch: "master",
                  },
                },
              ],
            }),
          });
        }
      );

      // Mock the create link endpoint
      await page.route(
        `**/internal/integrations/${connection.id}/links`,
        async (route: Route) => {
          if (route.request().method() === "POST") {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                linkId: "test-link-123",
              }),
            });
          }
        }
      );

      // Mock the sync endpoint
      await page.route(
        "**/internal/integrations/links/test-link-123/sync",
        async (route: Route) => {
          if (route.request().method() === "POST") {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                imported: 5,
              }),
            });
          }
        }
      );

      await page.goto(`/w/${organization.id}/settings/integrations`);

      // Should show "no links configured" state
      await expect(page.getByText("No links configured yet")).toBeVisible();
      await expect(
        page.getByText("You have a connection set up")
      ).toBeVisible();

      // Click "Add Your First Link"
      await page.getByRole("button", { name: "Add Your First Link" }).click();

      // Should open link configuration dialog
      await expect(page.getByText("Add GitHub Link")).toBeVisible();

      // Wait for repositories to load
      await expect(page.getByText("Loading repositories...")).toBeVisible();
      await expect(page.getByText("Loading repositories...")).not.toBeVisible({
        timeout: 5000,
      });

      // Fill in link details
      await page
        .getByPlaceholder("e.g. Web Docs, API Reference")
        .fill("Web Documentation");

      // Select repository
      await page.getByLabel("Repository").click();
      await page.getByRole("option", { name: "test-owner/test-repo" }).click();

      // Branch should be auto-filled with default_branch
      await expect(page.getByLabel("Branch")).toHaveValue("main");

      // Add base path
      await page.getByPlaceholder("docs or content/posts").fill("docs");

      // Submit form
      await page.getByRole("button", { name: /Create Link & Sync/i }).click();

      // Should show loading toast
      await expect(page.getByText("Starting initial sync...")).toBeVisible();

      // Should show success toast with imported count
      await expect(page.getByText(/Imported 5 document\(s\)/i)).toBeVisible({
        timeout: 10000,
      });

      // Cleanup
      await db
        .delete(integrationConnectionsTable)
        .where(eq(integrationConnectionsTable.id, connection.id));
    });

    test("should show and manage existing links", async ({
      page,
      organization,
    }) => {
      // Create test connection and link
      const [connection] = await db
        .insert(integrationConnectionsTable)
        .values({
          integrationType: "github",
          organizationId: organization.id,
          config: {
            accessToken: "test-token",
            owner: "test-owner",
            repo: "test-repo",
            branch: "main",
          },
          enabled: true,
        })
        .returning();

      const [link] = await db
        .insert(integrationLinksTable)
        .values({
          name: "Test Documentation",
          connectionId: connection.id,
          organizationId: organization.id,
          config: {
            owner: "test-owner",
            repo: "test-repo",
            branch: "main",
            basePath: "docs",
          },
          enabled: true,
          lastSyncedAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        })
        .returning();

      await page.goto(`/w/${organization.id}/settings/integrations`);

      // Should show the link in the table
      await expect(page.getByText("Test Documentation")).toBeVisible();
      await expect(page.getByText("test-owner/test-repo/docs")).toBeVisible();
      await expect(page.getByText("Enabled")).toBeVisible();
      await expect(page.getByText(/ago$/)).toBeVisible(); // "1 hour ago" or similar

      // Should show link in Connected Accounts section
      await expect(page.getByText("Connected Accounts")).toBeVisible();
      await expect(page.getByText("1 link")).toBeVisible();

      // Cleanup
      await db
        .delete(integrationLinksTable)
        .where(eq(integrationLinksTable.id, link.id));
      await db
        .delete(integrationConnectionsTable)
        .where(eq(integrationConnectionsTable.id, connection.id));
    });

    test("should allow syncing a link manually", async ({
      page,
      organization,
    }) => {
      // Create test connection and link
      const [connection] = await db
        .insert(integrationConnectionsTable)
        .values({
          integrationType: "github",
          organizationId: organization.id,
          config: {
            accessToken: "test-token",
            owner: "test-owner",
            repo: "test-repo",
            branch: "main",
          },
          enabled: true,
        })
        .returning();

      const [link] = await db
        .insert(integrationLinksTable)
        .values({
          name: "Test Docs",
          connectionId: connection.id,
          organizationId: organization.id,
          config: {
            owner: "test-owner",
            repo: "test-repo",
            branch: "main",
          },
          enabled: true,
        })
        .returning();

      // Mock the sync endpoint
      await page.route(
        `**/internal/integrations/links/${link.id}/sync`,
        async (route: Route) => {
          if (route.request().method() === "POST") {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                imported: 3,
              }),
            });
          }
        }
      );

      await page.goto(`/w/${organization.id}/settings/integrations`);

      // Find the link row and open menu
      const linkRow = page.getByRole("row", { name: /Test Docs/i });
      await linkRow.getByRole("button").first().click();

      // Click "Sync Now"
      await page.getByRole("menuitem", { name: "Sync Now" }).click();

      // Should show syncing toast
      await expect(page.getByText('Syncing "Test Docs"...')).toBeVisible();

      // Should show success toast
      await expect(
        page.getByText(/Synced 3 document\(s\) from "Test Docs"/i)
      ).toBeVisible({ timeout: 5000 });

      // Cleanup
      await db
        .delete(integrationLinksTable)
        .where(eq(integrationLinksTable.id, link.id));
      await db
        .delete(integrationConnectionsTable)
        .where(eq(integrationConnectionsTable.id, connection.id));
    });

    test("should allow deleting a link", async ({ page, organization }) => {
      // Create test connection and link
      const [connection] = await db
        .insert(integrationConnectionsTable)
        .values({
          integrationType: "github",
          organizationId: organization.id,
          config: {
            accessToken: "test-token",
            owner: "test-owner",
            branch: "main",
          },
          enabled: true,
        })
        .returning();

      const [link] = await db
        .insert(integrationLinksTable)
        .values({
          name: "Temp Docs",
          connectionId: connection.id,
          organizationId: organization.id,
          config: {
            owner: "test-owner",
            repo: "temp-repo",
            branch: "main",
          },
          enabled: true,
        })
        .returning();

      // Mock the delete endpoint
      await page.route(
        `**/internal/integrations/links/${link.id}`,
        async (route: Route) => {
          if (route.request().method() === "DELETE") {
            // Actually delete it from DB for testing
            await db
              .delete(integrationLinksTable)
              .where(eq(integrationLinksTable.id, link.id));

            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ success: true }),
            });
          }
        }
      );

      await page.goto(`/w/${organization.id}/settings/integrations`);

      // Find the link and open menu
      const linkRow = page.getByRole("row", { name: /Temp Docs/i });
      await linkRow.getByRole("button").first().click();

      // Click Delete
      await page.getByRole("menuitem", { name: "Delete" }).click();

      // Should show confirmation dialog
      await expect(page.getByText('Delete "Temp Docs" Link')).toBeVisible();
      await expect(
        page.getByText(/This action cannot be undone/i)
      ).toBeVisible();

      // Confirm deletion
      await page.getByRole("button", { name: /Confirm/i }).click();

      // Should show success toast
      await expect(page.getByText("Link deleted successfully")).toBeVisible();

      // Link should be removed from list
      await expect(page.getByText("Temp Docs")).not.toBeVisible();

      // Cleanup
      await db
        .delete(integrationConnectionsTable)
        .where(eq(integrationConnectionsTable.id, connection.id));
    });

    test("should disable 'Sync Now' when connection or link is disabled", async ({
      page,
      organization,
    }) => {
      // Create disabled connection
      const [connection] = await db
        .insert(integrationConnectionsTable)
        .values({
          integrationType: "github",
          organizationId: organization.id,
          config: {
            accessToken: "test-token",
            owner: "test-owner",
            branch: "main",
          },
          enabled: false, // Disabled
        })
        .returning();

      const [link] = await db
        .insert(integrationLinksTable)
        .values({
          name: "Disabled Link",
          connectionId: connection.id,
          organizationId: organization.id,
          config: {
            owner: "test-owner",
            repo: "test-repo",
            branch: "main",
          },
          enabled: true,
        })
        .returning();

      await page.goto(`/w/${organization.id}/settings/integrations`);

      // Should show as disabled
      await expect(page.getByText("Disabled Link")).toBeVisible();

      // Open menu
      const linkRow = page.getByRole("row", { name: /Disabled Link/i });
      await linkRow.getByRole("button").first().click();

      // "Sync Now" should not be visible when disabled
      await expect(
        page.getByRole("menuitem", { name: "Sync Now" })
      ).not.toBeVisible();
      await expect(
        page.getByRole("menuitem", { name: "Delete" })
      ).toBeVisible();

      // Cleanup
      await db
        .delete(integrationLinksTable)
        .where(eq(integrationLinksTable.id, link.id));
      await db
        .delete(integrationConnectionsTable)
        .where(eq(integrationConnectionsTable.id, connection.id));
    });
  });

  test.describe("Connection Management", () => {
    test("should allow disabling/enabling a connection", async ({
      page,
      organization,
    }) => {
      const [connection] = await db
        .insert(integrationConnectionsTable)
        .values({
          integrationType: "github",
          organizationId: organization.id,
          config: {
            accessToken: "test-token",
            owner: "test-owner",
            branch: "main",
          },
          enabled: true,
        })
        .returning();

      await page.goto(`/w/${organization.id}/settings/integrations`);

      // Find connection in Connected Accounts
      const connectionCard = page.locator(".rounded-lg", { hasText: "github" });
      await connectionCard.getByRole("button").first().click();

      // Click Disable
      await page.getByRole("menuitem", { name: "Disable" }).click();

      // Should show success toast
      await expect(page.getByText("Connection disabled")).toBeVisible();

      // Cleanup
      await db
        .delete(integrationConnectionsTable)
        .where(eq(integrationConnectionsTable.id, connection.id));
    });

    test("should allow deleting a connection", async ({
      page,
      organization,
    }) => {
      const [connection] = await db
        .insert(integrationConnectionsTable)
        .values({
          integrationType: "github",
          organizationId: organization.id,
          config: {
            accessToken: "test-token",
            owner: "test-owner",
            branch: "main",
          },
          enabled: true,
        })
        .returning();

      await page.goto(`/w/${organization.id}/settings/integrations`);

      const connectionCard = page.locator(".rounded-lg", { hasText: "github" });
      await connectionCard.getByRole("button").first().click();

      await page.getByRole("menuitem", { name: "Delete" }).click();

      // Should show confirmation
      await expect(page.getByText('Delete "github" Connection')).toBeVisible();
      await expect(
        page.getByText(
          /All sync metadata for this connection will be permanently deleted/i
        )
      ).toBeVisible();

      // Confirm
      await page.getByRole("button", { name: /Confirm/i }).click();

      // Should show success
      await expect(
        page.getByText("Connection deleted successfully")
      ).toBeVisible();

      // Connection should be gone
      await expect(page.getByText("Connected Accounts")).not.toBeVisible();
      await expect(
        page.getByText("No integrations connected yet")
      ).toBeVisible();
    });
  });
});
