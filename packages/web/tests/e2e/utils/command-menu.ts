export async function triggerCommandMenuShortcut(page: any) {
  // Ensure the page has focus
  await page.bringToFront();

  // Click on the page to ensure it has focus and can receive keyboard events
  await page.click("body");

  // Use Playwright's native press method
  // Try Meta+k (lowercase) first, which sometimes works better
  await page.keyboard.press("Meta+k");
}
