import { test, expect } from "@playwright/test";

const SETTLE_GROUP_NAME = `Settle Test ${Date.now()}`;

test.describe("Settle Page (authenticated)", () => {
  test.describe.configure({ mode: "serial" });

  let groupId: string;

  test("setup: create group for settle tests", async ({ page }) => {
    await page.goto("/");
    await page.locator(".sidebar-add-btn").click();
    await page.locator(".sidebar-create-form input").fill(SETTLE_GROUP_NAME);
    await page.locator(".sidebar-submit-btn").click();

    // Wait for group in sidebar, then click it
    const groupLink = page.locator(".sidebar-item-name", {
      hasText: SETTLE_GROUP_NAME,
    });
    await expect(groupLink).toBeVisible({ timeout: 10_000 });
    await groupLink.click();
    await page.waitForURL(/\/group\//, { timeout: 10_000 });

    const match = page.url().match(/\/group\/([^/]+)/);
    groupId = match![1];
  });

  test("navigate to settle page from group detail", async ({ page }) => {
    await page.goto(`/group/${groupId}`);
    await expect(page.locator(".group-detail-header h2")).toHaveText(
      SETTLE_GROUP_NAME,
      { timeout: 10_000 },
    );

    // With only 1 member, balances should be settled
    await expect(page.getByText("All settled up!")).toBeVisible();
  });

  test("settle page renders with back link and heading", async ({ page }) => {
    await page.goto(`/group/${groupId}/settle`);

    await expect(page.locator(".back-link")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("h2")).toHaveText("Settle Up");
  });

  test("settle page shows all-settled state for single member group", async ({
    page,
  }) => {
    await page.goto(`/group/${groupId}/settle`);

    await expect(page.getByText("All settled")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("No outstanding balances")).toBeVisible();
  });

  test("back link navigates to group detail", async ({ page }) => {
    await page.goto(`/group/${groupId}/settle`);
    await expect(page.locator(".back-link")).toBeVisible({ timeout: 10_000 });

    await page.locator(".back-link").click();
    await expect(page).toHaveURL(`/group/${groupId}`);
  });
});
