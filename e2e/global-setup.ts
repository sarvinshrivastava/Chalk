import { test as setup, expect } from "@playwright/test";
import fs from "fs";

/**
 * Global setup: signs into a pre-existing test account via the backend API,
 * then injects the session into the browser so all subsequent tests are authenticated.
 */

const API_URL = "http://localhost:3000";
const TEST_EMAIL = "test@test.com";
const TEST_PASSWORD = "test@1234";

const AUTH_FILE = "./e2e/.auth/user.json";

setup("authenticate with test account", async ({ page, request }) => {
  // Sign in via backend API
  const signinRes = await request.post(`${API_URL}/auth/signin/email`, {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    headers: { "Content-Type": "application/json" },
  });

  if (!signinRes.ok()) {
    const err = await signinRes.json();
    throw new Error(
      `Signin failed (${signinRes.status()}): ${JSON.stringify(err)}`,
    );
  }

  const { session, user } = await signinRes.json();

  if (!session?.access_token) {
    throw new Error("No access_token in session.");
  }

  // Inject session into browser localStorage
  await page.goto("/login");
  await expect(page.locator("h1")).toContainText("chalk");

  await page.evaluate(
    ({ session, user }) => {
      const keys = Object.keys(localStorage);
      const existingKey = keys.find(
        (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
      );
      const storageKey = existingKey || "sb-krejurnqoyqraeydmvlx-auth-token";

      localStorage.setItem(
        storageKey,
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_in: session.expires_in || 3600,
          expires_at:
            session.expires_at || Math.floor(Date.now() / 1000) + 3600,
          token_type: "bearer",
          user,
        }),
      );
    },
    { session, user },
  );

  // Verify authentication
  await page.goto("/");
  await expect(page.locator("text=Welcome to")).toBeVisible({
    timeout: 15_000,
  });

  // Save browser state for other tests
  await page.context().storageState({ path: AUTH_FILE });
});
