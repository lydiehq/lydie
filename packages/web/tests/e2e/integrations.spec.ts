import { test, expect } from "./fixtures/auth.fixture";

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
    await page.goto(`/w/${organization.id}/settings/integrations`);
    await page.waitForURL(`/w/${organization.id}/settings/integrations`);
    await page.getByRole("link", { name: "GitHub" }).click();
    await page.waitForURL(`/w/${organization.id}/settings/integrations/github`);
    await expect(
      page.getByRole("heading", { name: "GitHub", level: 1 })
    ).toBeVisible();
  });
});
