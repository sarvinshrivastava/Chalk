import { test, expect } from "@playwright/test";

test.describe("Auth Pages (unauthenticated)", () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // override — no auth

  test("login page renders with branding and form", async ({ page }) => {
    await page.goto("/login");

    // Branding
    await expect(page.locator("h1")).toContainText("chalk");
    await expect(page.getByText("Keep score. Stay even.")).toBeVisible();

    // Form fields
    await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
    await expect(page.getByPlaceholder("Enter password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

    // Google OAuth
    await expect(page.getByRole("button", { name: /Google/ })).toBeVisible();

    // Signup link
    await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
  });

  test("signup page renders with name field and form", async ({ page }) => {
    await page.goto("/signup");

    await expect(page.locator("h1")).toContainText("chalk");
    await expect(page.getByPlaceholder("Your name")).toBeVisible();
    await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
    await expect(page.getByPlaceholder("Min 6 characters")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create account" }),
    ).toBeVisible();

    // Login link
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  });

  test("navigate from login to signup and back", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/signup/);

    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");

    await page.getByPlaceholder("you@example.com").fill("bad@example.com");
    await page.getByPlaceholder("Enter password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.locator(".error-text")).toBeVisible({ timeout: 10_000 });
  });

  test("protected routes redirect to login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/group/some-id");
    await expect(page).toHaveURL(/\/login/);
  });
});
