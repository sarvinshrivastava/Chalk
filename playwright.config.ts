import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // run sequentially — tests depend on prior state (signup → login → groups)
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 30_000,

  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "setup",
      testMatch: /global-setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "./e2e/.auth/user.json",
      },
      dependencies: ["setup"],
      testMatch: /(?!global-setup).*\.spec\.ts/,
    },
  ],
});
