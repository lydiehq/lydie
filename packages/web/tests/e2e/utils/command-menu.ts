export async function triggerCommandMenuShortcut(page: any) {
  await page.bringToFront();
  await page.click("body");

  await page.keyboard.press("Meta+k");
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible()) {
    return;
  }

  await page.keyboard.press("Control+k");
  if (await dialog.isVisible()) {
    return;
  }

  const quickActionButton = page.getByRole("button", { name: "Quick Action" });
  if (await quickActionButton.isVisible()) {
    await quickActionButton.click();
  }
}
