import { test, expect } from "@playwright/test";

const TEST_GROUP_NAME = `E2E Group ${Date.now()}`;

test.describe("Groups Flow (authenticated)", () => {
  test.describe.configure({ mode: "serial" });

  let groupUrl: string;

  test("create a new group via sidebar", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".groups-sidebar")).toBeVisible();

    // Click the + button to show create form
    await page.locator(".sidebar-add-btn").click();
    await expect(page.locator(".sidebar-create-form")).toBeVisible();

    // Fill in group name and submit
    await page.locator(".sidebar-create-form input").fill(TEST_GROUP_NAME);
    await page.locator(".sidebar-submit-btn").click();

    // Sidebar doesn't auto-navigate — wait for group to appear in list, then click it
    const groupLink = page.locator(".sidebar-item-name", {
      hasText: TEST_GROUP_NAME,
    });
    await expect(groupLink).toBeVisible({ timeout: 10_000 });

    await groupLink.click();
    await page.waitForURL(/\/group\//, { timeout: 10_000 });
    groupUrl = page.url();

    // Group name should appear in the detail view
    await expect(page.locator(".group-detail-header h2")).toHaveText(
      TEST_GROUP_NAME,
    );
  });

  test("new group appears in sidebar", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".groups-sidebar")).toBeVisible();

    await expect(
      page.locator(".sidebar-item-name", { hasText: TEST_GROUP_NAME }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("group detail page shows members and actions", async ({ page }) => {
    await page.goto(groupUrl || "/");
    if (!groupUrl) {
      await page
        .locator(".sidebar-item-name", { hasText: TEST_GROUP_NAME })
        .click();
      await page.waitForURL(/\/group\//);
    }

    await expect(page.locator(".group-detail-header h2")).toHaveText(
      TEST_GROUP_NAME,
    );
    await expect(page.locator(".member-count")).toContainText("1 member");
    await expect(
      page.getByRole("link", { name: "+ Add expense" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Invite member" }),
    ).toBeVisible();
    await expect(page.locator(".members-card")).toBeVisible();
    await expect(
      page.locator(".member-name", { hasText: "You" }),
    ).toBeVisible();
    await expect(page.getByText("No expenses yet")).toBeVisible();
    await expect(page.getByText("All settled up!")).toBeVisible();
  });

  test("invite member form toggles on click", async ({ page }) => {
    await page.goto(groupUrl || "/");
    if (!groupUrl) {
      await page
        .locator(".sidebar-item-name", { hasText: TEST_GROUP_NAME })
        .click();
      await page.waitForURL(/\/group\//);
    }

    await expect(page.locator(".invite-form")).not.toBeVisible();

    await page.getByRole("button", { name: "Invite member" }).click();
    await expect(page.locator(".invite-form")).toBeVisible();
    await expect(page.getByPlaceholder("+91XXXXXXXXXX")).toBeVisible();

    await page.getByRole("button", { name: "Invite member" }).click();
    await expect(page.locator(".invite-form")).not.toBeVisible();
  });
});
