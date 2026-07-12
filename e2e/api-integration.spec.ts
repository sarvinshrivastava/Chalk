import { test, expect } from "@playwright/test";

const API_URL = "http://localhost:3000";

test.describe("API Integration (backend reachable from browser)", () => {
  test("backend responds to auth endpoint", async ({ page }) => {
    const response = await page.request.post(`${API_URL}/auth/signin/email`, {
      data: { email: "nonexistent@test.com", password: "wrong" },
      headers: { "Content-Type": "application/json" },
    });

    expect([400, 401, 422]).toContain(response.status());
  });

  test("groups endpoint requires auth", async ({ page }) => {
    const response = await page.request.get(`${API_URL}/groups`, {
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status()).toBe(401);
  });

  test("groups endpoint works with auth (via storageState)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForTimeout(2000); // let Supabase initialize

    // Supabase v2 stores session under sb-<ref>-auth-token
    const token = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      const sbKey = keys.find(
        (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
      );
      if (!sbKey) return null;

      try {
        const raw = localStorage.getItem(sbKey);
        if (!raw) return null;
        const data = JSON.parse(raw);
        return data.access_token || null;
      } catch {
        return null;
      }
    });

    expect(token).toBeTruthy();

    const response = await page.request.get(`${API_URL}/groups`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("groups");
    expect(Array.isArray(body.groups)).toBe(true);
  });

  test("expenses endpoint requires auth", async ({ page }) => {
    const response = await page.request.get(`${API_URL}/expenses`, {
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status()).toBe(401);
  });

  test("CORS headers are present", async ({ page }) => {
    const response = await page.request.get(`${API_URL}/groups`, {
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
    });

    const corsHeader = response.headers()["access-control-allow-origin"];
    expect(corsHeader).toBeTruthy();
  });
});
