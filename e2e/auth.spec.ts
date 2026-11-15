/**
 * Sign-in, sessions and closed sign-up (foundation.md sections 8 and 9).
 *
 * Google itself cannot be driven by a test, so these tests cover everything around it: the
 * sign-in screen, the refusal message for accounts not on the list, the route guard, the
 * standard 401 for API calls, and sign-out. The real Google round trip is a manual check
 * (docs/qa/coverage.md).
 */
import { BASE_URL } from "./support/env";
import { expect, test } from "./support/fixtures";
import { request } from "@playwright/test";
import { openApp } from "./support/app";
import { call } from "./support/api";

test.describe("sign-in and sessions", () => {
  test("test sign-in puts a person on Today and survives a reload", async ({ alice }) => {
    await openApp(alice, "/today");
    await expect(alice.page.getByTestId("nav-today")).toBeVisible();
    await alice.page.reload();
    await expect(alice.page).toHaveURL(/\/today$/);
    await expect(alice.page.getByTestId("nav-today")).toBeVisible();
  });

  test("a visitor with no session is sent to the sign-in page with a Google button", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto("/today");
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByTestId("sign-in-google")).toHaveText("Continue with Google");
    await context.close();
  });

  test("API calls without a session get the standard 401 error shape", async () => {
    const api = await request.newContext({ baseURL: BASE_URL });
    const result = await call<{ error: { code: string; message: string; traceId: string } }>(
      api,
      "GET",
      "/api/tasks",
    );
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("unauthenticated");
    expect(result.body.error.traceId).toBeTruthy();
    await api.dispose();
  });

  test("closed sign-up: a refused account sees the friendly invite-list message", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto("/sign-in?error=not_allowed");
    const notice = page.getByText("isn't on the invite list yet");
    await expect(notice).toBeVisible();
    await expect(notice).not.toContainText(/error|exception|500/i);
    await context.close();
  });

  test("the test-only login refuses a name that is not a valid test user", async ({ alice }) => {
    const response = await alice.api.post(`${BASE_URL}/api/auth/test-login`, {
      data: { user: "Not Valid!" },
      headers: { Origin: BASE_URL },
      failOnStatusCode: false,
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
  });

  test("sign out returns to the sign-in page and the session stops working", async ({ alice }) => {
    await openApp(alice, "/settings");
    await alice.page.getByTestId("sign-out").click();
    await expect(alice.page).toHaveURL(/\/sign-in/);
    const after = await call(alice.api, "GET", "/api/tasks");
    expect(after.status).toBe(401);
  });
});
