import { test, expect } from "@playwright/test";

/**
 * UI smoke against Vite only — no Tauri IPC.
 * Search/download require the native window (npm run tauri -- dev).
 */
test("home renders brand and search chrome", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "CH" })).toBeVisible();
  await expect(page.locator("#search")).toBeVisible();
});

test("language toggle is visible in sidebar when expanded", async ({ page }) => {
  await page.goto("/");
  const expand = page.getByRole("button", { name: /Desplegar|Expand/i });
  if (await expand.isVisible()) {
    await expand.click();
  }
  await expect(page.getByRole("button", { name: "ES", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "EN", exact: true })).toBeVisible();
});
