/**
 * Shared Playwright fixtures.
 *
 *   newPerson(label)  a new, uniquely named test account with its own browser context,
 *                     signed in through the test-only login. Deleted after the test.
 *   alice, bob        two people for the isolation tests (each a fresh account per test).
 *
 * Every test therefore starts from empty data and cleans up after itself. Accounts never
 * collide between tests, workers or repeated runs.
 */
import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
  expect,
  test as base,
} from "@playwright/test";
import { randomBytes } from "node:crypto";
import { BASE_URL } from "./env";

export interface Person {
  /** Short label used in the test, for example "alice". */
  label: string;
  /** The test-user name (lowercase, digits, dashes). */
  name: string;
  email: string;
  userId: string;
  /** The person's own browser context: its cookies hold the session. */
  context: BrowserContext;
  page: Page;
  /** API requests made as this person (shares the session cookie). */
  api: APIRequestContext;
}

export type NewPerson = (label: string) => Promise<Person>;

type Fixtures = {
  newPerson: NewPerson;
  alice: Person;
  bob: Person;
};

/** A unique, valid test-user name, for example qa-alice-3f9a0c12. */
function uniqueName(label: string): string {
  const safe =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 12) || "person";
  return `qa-${safe}-${randomBytes(4).toString("hex")}`;
}

/** Context options taken from the project's device settings (viewport, touch, etc.). */
function contextOptions(testInfo: TestInfo) {
  const use = testInfo.project.use;
  return {
    baseURL: BASE_URL,
    viewport: use.viewport ?? undefined,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    deviceScaleFactor: use.deviceScaleFactor,
    locale: use.locale,
    timezoneId: use.timezoneId,
  };
}

/** Signs a context in through the test-only login. Returns the user id. */
export async function testLogin(api: APIRequestContext, name: string): Promise<string> {
  const attempt = () =>
    api.post("/api/auth/test-login", {
      data: { user: name },
      headers: { Origin: BASE_URL },
    });
  let response = await attempt();
  // The app's built-in rate limiter counts busy sources; a short pause and a retry is enough here.
  for (let wait = 1; response.status() === 429 && wait <= 4; wait += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000 * wait));
    response = await attempt();
  }
  expect(response.status(), "test login should succeed").toBe(200);
  const body = (await response.json()) as { user: { id: string } };
  return body.user.id;
}

export const test = base.extend<Fixtures>({
  newPerson: async ({ browser }: { browser: Browser }, provide, testInfo) => {
    const made: Person[] = [];

    const newPerson: NewPerson = async (label) => {
      const name = uniqueName(label);
      const context = await browser.newContext(contextOptions(testInfo));
      const page = await context.newPage();
      const userId = await testLogin(context.request, name);
      const person: Person = {
        label,
        name,
        email: `${name}@test.flowzone.invalid`,
        userId,
        context,
        page,
        api: context.request,
      };
      made.push(person);
      return person;
    };

    await provide(newPerson);

    // Clean up: delete each account (its rows cascade), then close its browser context.
    for (const person of made) {
      try {
        // A test may already have deleted its own account; that is fine.
        await person.api.post("/api/account/delete", {
          data: { confirm: "DELETE" },
          headers: { Origin: BASE_URL },
        });
      } catch {
        // Ignored on purpose: the account is removed by the global teardown in any case.
      } finally {
        await person.context.close();
      }
    }
  },

  alice: async ({ newPerson }, provide) => {
    await provide(await newPerson("alice"));
  },

  bob: async ({ newPerson }, provide) => {
    await provide(await newPerson("bob"));
  },
});

export { expect } from "@playwright/test";
