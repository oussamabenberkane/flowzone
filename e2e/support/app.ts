/**
 * Helpers for driving the app as a person. Prefer roles, labels and the data-testid
 * hooks documented in docs/contracts/design-system.md (section 9) and the handoffs.
 */
import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import type { Person } from "./fixtures";
import { BASE_URL } from "./env";

/** Words that must never appear on a falling-behind or home screen (foundation brief: never guilt-inducing). */
export const GUILT_WORDS =
  /\b(overdue|late|behind|missed|failed|failure|streak|streaks|points?|badges?|confetti|you forgot|you should have|don'?t forget|lazy|days? (?:late|overdue|behind|ago))\b/i;

/**
 * Opens a path as the person. First-run choices are marked done through the API (the
 * documented first-run sequence, api.md 4.9) so the sheet does not cover the page. Pass
 * `keepFirstRun` to leave the sheet alone (the first-run test does that).
 */
export async function openApp(
  person: Person,
  path = "/today",
  options: { keepFirstRun?: boolean } = {},
): Promise<void> {
  if (!options.keepFirstRun) await markFirstRunDone(person.api);
  await person.page.goto(path);
  await expect(person.page.getByTestId("nav-today")).toBeVisible();
}

/** Marks the first run done for the account, setting its time zone (api.md 4.9). */
export async function markFirstRunDone(api: APIRequestContext): Promise<void> {
  const response = await api.patch(`${BASE_URL}/api/settings`, {
    data: { timeZone: "Europe/Paris", firstRunCompleted: true },
  });
  expect(response.status(), "settings update should succeed").toBe(200);
}

/** Navigates with the bottom bar (phone) or side rail (desktop); both use the same test ids. */
export async function goTo(
  page: Page,
  section: "today" | "inbox" | "projects" | "notes" | "settings",
) {
  await page.getByTestId(`nav-${section}`).click();
  // Matches the section page itself (/notes or /notes?x), not a page inside it (/notes/<id>).
  await expect(page).toHaveURL(new RegExp(`/${section}(\\?.*)?$`));
}

/**
 * Captures a task through the Capture sheet with plain language. Waits until the task is saved.
 * Returns once the sheet has closed.
 */
export async function capture(page: Page, text: string): Promise<void> {
  await page.getByTestId("quick-add-button").click();
  const input = page.getByTestId("quick-add-input");
  await input.fill(text);
  await expect(page.getByTestId("quick-add-understood")).toBeVisible();
  await page.getByTestId("quick-add-save").click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

/** Whether a locator becomes visible within a short wait (for optional screens such as sheets). */
export async function isVisibleSoon(locator: Locator, ms = 2000): Promise<boolean> {
  return locator.isVisible({ timeout: ms }).catch(() => false);
}

/** Visible text of the page, for wording checks. */
export async function visibleText(page: Page): Promise<string> {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
}

/** Fails if the visible text of the page contains guilt-inducing or overdue wording. */
export async function expectCalmWording(page: Page): Promise<void> {
  const text = await visibleText(page);
  const hit = GUILT_WORDS.exec(text);
  expect(hit, `guilt or overdue wording on screen: "${hit?.[0]}"`).toBeNull();
}
