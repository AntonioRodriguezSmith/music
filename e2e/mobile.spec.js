import { test, expect, devices } from "@playwright/test";

// The Pixel 7 device descriptor sets an Android user agent, which activates the
// mobile shell (`isMobile()` in src/lib/tauri_env.js).
test.use({ ...devices["Pixel 7"] });

test("mobile shell renders bottom navigation", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation");
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("button", { name: /Buscar|Search/i })).toBeVisible();
  await expect(nav.getByRole("button", { name: /Cola|Queue/i })).toBeVisible();
  await expect(nav.getByRole("button", { name: /Playlists/i })).toBeVisible();
  await expect(nav.getByRole("button", { name: /Ajustes|Settings/i })).toBeVisible();
});

test("mobile search tab keeps the search bar visible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByPlaceholder(/Buscar o pegar|Search/i)).toBeVisible();
  const nav = page.getByRole("navigation");
  await expect(nav).toBeVisible();
});
