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

test("sidebar expands showing queue and history tabs", async ({ page }) => {
  await page.goto("/");
  const expand = page.getByRole("button", { name: /Desplegar|Expand/i });
  if (await expand.isVisible()) {
    await expand.click();
  }
  await expect(page.getByRole("button", { name: /Cola|Queue/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Historial|History/i })).toBeVisible();
});

test("player mode route renders search chrome", async ({ page }) => {
  await page.goto("/player");
  await expect(page.getByRole("button", { name: /Player/i }).first()).toBeVisible();
  await expect(page.locator("#search")).toBeVisible();
});
