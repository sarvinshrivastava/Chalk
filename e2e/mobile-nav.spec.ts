import { test, expect } from "@playwright/test";

test.describe("Mobile Navigation", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("hamburger button is visible on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".hamburger-btn")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("hamburger opens drawer with groups", async ({ page }) => {
    await page.goto("/");
    await page.locator(".hamburger-btn").click();
    await expect(page.locator(".drawer--open")).toBeVisible();
    await expect(page.locator(".drawer .groups-sidebar")).toBeVisible();
  });

  test("clicking backdrop closes drawer", async ({ page }) => {
    await page.goto("/");
    await page.locator(".hamburger-btn").click();
    await expect(page.locator(".drawer--open")).toBeVisible();
    await page.locator(".drawer-backdrop").click();
    await expect(page.locator(".drawer--open")).not.toBeVisible();
  });

  test("sidebar is hidden on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("aside.sidebar")).not.toBeVisible();
  });
});
