import { test, expect } from "@playwright/test";

const EXPENSE_GROUP_NAME = `Expense Test ${Date.now()}`;
const EXPENSE_DESC = "E2E Dinner Test";
const EXPENSE_AMOUNT = "250.00";

test.describe("Expenses Flow (authenticated)", () => {
  test.describe.configure({ mode: "serial" });

  let groupId: string;

  test("setup: create a group for expense tests", async ({ page }) => {
    await page.goto("/");
    await page.locator(".sidebar-add-btn").click();
    await page.locator(".sidebar-create-form input").fill(EXPENSE_GROUP_NAME);
    await page.locator(".sidebar-submit-btn").click();

    // Wait for group to appear in sidebar, then click it
    const groupLink = page.locator(".sidebar-item-name", {
      hasText: EXPENSE_GROUP_NAME,
    });
    await expect(groupLink).toBeVisible({ timeout: 10_000 });
    await groupLink.click();
    await page.waitForURL(/\/group\//, { timeout: 10_000 });

    const match = page.url().match(/\/group\/([^/]+)/);
    groupId = match![1];
  });

  test("navigate to add expense page", async ({ page }) => {
    await page.goto(`/group/${groupId}`);
    await expect(page.locator(".group-detail-header h2")).toHaveText(
      EXPENSE_GROUP_NAME,
      { timeout: 10_000 },
    );

    await page.getByRole("link", { name: "+ Add expense" }).click();
    await expect(page).toHaveURL(`/group/${groupId}/add-expense`);
    await expect(page.locator("h2")).toHaveText("Add Expense");
  });

  test("add expense form has all required fields", async ({ page }) => {
    await page.goto(`/group/${groupId}/add-expense`);

    await expect(
      page.getByPlaceholder("e.g. Dinner at Meghana Foods"),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder("0.00")).toBeVisible();
    await expect(page.locator(".split-section")).toBeVisible();
    await expect(page.locator(".member-chip")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add expense" }),
    ).toBeVisible();
  });

  test("cancel button returns to group detail", async ({ page }) => {
    await page.goto(`/group/${groupId}/add-expense`);
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page).toHaveURL(`/group/${groupId}`);
  });

  test("create an expense successfully", async ({ page }) => {
    await page.goto(`/group/${groupId}/add-expense`);

    await expect(
      page.getByPlaceholder("e.g. Dinner at Meghana Foods"),
    ).toBeVisible({ timeout: 10_000 });

    await page
      .getByPlaceholder("e.g. Dinner at Meghana Foods")
      .fill(EXPENSE_DESC);
    await page.getByPlaceholder("0.00").fill(EXPENSE_AMOUNT);

    await expect(page.locator(".member-chip.selected")).toHaveCount(1);
    await expect(page.locator(".split-preview")).toContainText("per person");

    await page.getByRole("button", { name: "Add expense" }).click();
    await expect(page).toHaveURL(`/group/${groupId}`, { timeout: 10_000 });
  });

  test("expense appears in group activity feed", async ({ page }) => {
    await page.goto(`/group/${groupId}`);

    await expect(
      page.locator(".expense-desc", { hasText: EXPENSE_DESC }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".expense-card .amount").first()).toBeVisible();
    await expect(page.getByText("No expenses yet")).not.toBeVisible();
  });

  test("expense shows delete button for own expenses", async ({ page }) => {
    await page.goto(`/group/${groupId}`);

    await expect(
      page.locator(".expense-desc", { hasText: EXPENSE_DESC }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".expense-delete-btn").first()).toBeVisible();
  });
});
