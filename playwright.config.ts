/**
 * Playwright configuration for the FlowZone functional test suite (see docs/testing.md).
 *
 * Before running, set E2E_DATABASE_URL to a local test database (see docs/setup.md). The
 * suite starts its own test server on port 3100 with test-only settings: test sign-in on,
 * the stand-in AI and a test-only tick clock. It never uses Google, real AI quota or a
 * production database.
 */
import { defineConfig, devices } from "@playwright/test";
import {
  BASE_URL,
  E2E_PORT,
  ensureTestCertificate,
  testDatabaseUrl,
  testServerEnv,
} from "./e2e/support/env";

// Fail early, with a clear message, if the database is not a safe local test database.
testDatabaseUrl();
// The test server must trust the push stub's certificate from its first start.
const { certPath } = ensureTestCertificate();

const reuseServer = process.env.E2E_REUSE_SERVER === "1";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["support/**"],
  // Two workers keep the test server's built-in rate limiter from throttling the whole run.
  workers: Number(process.env.E2E_WORKERS ?? 2),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  globalSetup: "./e2e/support/global-setup.ts",

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "en-GB",
    timezoneId: "Europe/Paris",
  },

  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 860 },
      },
    },
    {
      // Phone-sized: 390 x 844 (iPhone 12-14 size), touch enabled.
      name: "phone",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],

  webServer: {
    // Migrate the test database, build with test settings, then serve on the test port.
    command: `npm run db:migrate && npm run build && npm run start -- --port ${E2E_PORT}`,
    url: `${BASE_URL}/api/health`,
    env: testServerEnv({ NODE_EXTRA_CA_CERTS: certPath }),
    reuseExistingServer: reuseServer,
    timeout: 360_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
