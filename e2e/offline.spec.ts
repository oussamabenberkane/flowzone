/**
 * Offline: quick capture works without a connection and is sent exactly once when the
 * connection returns; Today can be viewed offline from the copy saved on the device.
 *
 * These tests use the production build, where the service worker is active (it is off in
 * development by design). Real network loss on a phone is a manual check (docs/qa/push-checklist.md).
 */
import { openApp } from "./support/app";
import { ok, type TaskView } from "./support/api";
import { expect, test, type Person } from "./support/fixtures";

async function countTasksTitled(api: import("@playwright/test").APIRequestContext, title: string) {
  const all = await ok<{ tasks: TaskView[] }>(api, "GET", "/api/tasks?status=all&limit=100");
  return all.tasks.filter((task) => task.title === title).length;
}

/**
 * Opens the app and waits until the signed-in check has finished. Captures made offline need
 * to know whose they are, so a person (and this test) must not go offline before that check.
 */
async function openSignedIn(person: Person): Promise<void> {
  const sessionChecked = person.page.waitForResponse(
    (response) => response.url().includes("/api/auth/get-session") && response.status() === 200,
    { timeout: 20_000 },
  );
  await openApp(person, "/today");
  await sessionChecked;
}

test.describe("offline", () => {
  test("a capture made offline is kept on the device and sent exactly once on reconnect", async ({
    alice,
  }) => {
    await openSignedIn(alice);
    await alice.context.setOffline(true);
    // Wait until the app knows it is offline, as a person would before saving.
    await expect(alice.page.getByTestId("offline-line")).toBeVisible();

    await alice.page.getByTestId("quick-add-button").click();
    await alice.page.getByTestId("quick-add-input").fill("Offline idea about the garden");
    await expect(alice.page.getByTestId("quick-add-save")).toHaveText("Save on this device");
    await alice.page.getByTestId("quick-add-save").click();
    await expect(alice.page.getByRole("dialog")).toBeHidden();
    await expect(alice.page.getByTestId("sync-line")).toContainText("waiting to be sent");

    await alice.context.setOffline(false);
    await alice.page.evaluate(() => window.dispatchEvent(new Event("online")));

    await expect(alice.page.getByTestId("sync-line")).toHaveCount(0);
    await expect.poll(() => countTasksTitled(alice.api, "Offline idea about the garden")).toBe(1);

    // A second reconnect signal must not create a second task.
    await alice.page.evaluate(() => window.dispatchEvent(new Event("online")));
    await alice.page.waitForTimeout(1000);
    expect(await countTasksTitled(alice.api, "Offline idea about the garden")).toBe(1);
  });

  test("Today opens from the saved copy when offline, read-only", async ({ alice }) => {
    await openApp(alice, "/today");
    await expect(alice.page.getByTestId("nav-today")).toBeVisible();
    // A returning person's page is controlled by the service worker. Reload once online so it is.
    // Under load the worker can answer a slow online reload with its offline page (defect D-04),
    // so reload again until the real page has loaded; the check below still proves the copy.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await alice.page.reload();
      const loaded = await alice.page
        .getByTestId("today-plan")
        .waitFor({ state: "visible", timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      if (loaded) break;
    }
    await alice.page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, {
      timeout: 15_000,
    });
    await expect(alice.page.getByTestId("today-plan")).toBeVisible();
    // The worker saves the page in the background; wait until the copy exists before going offline.
    await expect
      .poll(() =>
        alice.page.evaluate(async () => {
          const cache = await caches.open("flowzone-pages-v1");
          return (await cache.keys()).some((request) => new URL(request.url).pathname === "/today");
        }),
      )
      .toBe(true);

    await alice.context.setOffline(true);
    await alice.page.reload();
    await expect(alice.page.getByTestId("nav-today")).toBeVisible();
    await expect(alice.page.getByTestId("offline-line")).toContainText("offline");
    await expect(alice.page.getByTestId("today-plan")).toBeVisible();

    await alice.context.setOffline(false);
    await alice.page.reload();
    await expect(alice.page.getByTestId("offline-line")).toHaveCount(0);
  });

  test("an offline capture does not appear twice after a reload", async ({ alice }) => {
    await openSignedIn(alice);
    await alice.context.setOffline(true);
    await expect(alice.page.getByTestId("offline-line")).toBeVisible();
    await alice.page.getByTestId("quick-add-button").click();
    await alice.page.getByTestId("quick-add-input").fill("Offline reminder about vitamins");
    await alice.page.getByTestId("quick-add-save").click();
    await expect(alice.page.getByRole("dialog")).toBeHidden();

    await alice.context.setOffline(false);
    await alice.page.reload();
    await expect.poll(() => countTasksTitled(alice.api, "Offline reminder about vitamins")).toBe(1);
    // Reloading after the send must not send it again.
    await alice.page.reload();
    await alice.page.waitForTimeout(1000);
    expect(await countTasksTitled(alice.api, "Offline reminder about vitamins")).toBe(1);
  });
});
