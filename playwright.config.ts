import { defineConfig, devices } from "@playwright/test";

// Critical-flow E2E tests. Locally/CI: starts the real server on an isolated *_test database.
// Live: BASE_URL=https://userelayflow.com npx playwright test  (read-only tests only).
const PORT = 8788;
export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results/e2e", // keep separate from the visual test's screenshots
  timeout: 30_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: process.env.BASE_URL || `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npx tsx scripts/test/serve.ts",
        env: { TEST_DB_NAME: "relayflow_e2e_test", TEST_PORT: String(PORT) },
        url: `http://localhost:${PORT}/api/health`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
