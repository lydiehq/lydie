import { test, expect } from "./fixtures/auth.fixture";

const defaultIntegrations = ["github", "shopify", "wordpress"];

// It is limited how much we want to test of our integrations, as we do not want
// to hit the external APIs too much.
// in the future we might create a "local" extension that we have control over
// in order to test more in-depth.
test.describe("integrations", () => {
  test("metadata shows in the integrations list", async ({
    page,
    organization,
  }) => {
    await page.goto(`/w/${organization.id}/settings/integrations`);
    await page.waitForURL(`/w/${organization.id}/settings/integrations`);

    await expect(page.getByRole("heading", { name: "GitHub" })).toBeVisible();
  });

  test("can go to integration settings page", async ({
    page,
    organization,
  }) => {
    for (const integration of defaultIntegrations) {
      await page.goto(`/w/${organization.id}/settings/integrations`);
      await page.waitForURL(`/w/${organization.id}/settings/integrations`);
      await page.getByRole("link", { name: integration }).click();
      await page.waitForURL(
        `/w/${organization.id}/settings/integrations/${integration}`
      );
    }
  });
});
