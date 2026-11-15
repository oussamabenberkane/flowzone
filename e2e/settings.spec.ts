/**
 * Settings: the AI and nudges switches, time zone and quiet hours, display controls (text size,
 * dyslexia-friendly font, less motion), export everything, and delete account and all data.
 */
import { openApp, markFirstRunDone } from "./support/app";
import { call, createTask, ok, todayIso, type TaskView } from "./support/api";
import { expect, test } from "./support/fixtures";
import { testLogin } from "./support/fixtures";

interface SettingsView {
  timeZone: string;
  quietHours: { start: string; end: string };
  consent: Record<string, { enabled: boolean; changedAt: string | null }>;
}

test.describe("settings", () => {
  test("each switch takes effect at once and is kept on the account", async ({ alice }) => {
    await openApp(alice, "/settings");
    const page = alice.page;

    await page.getByTestId("switch-nudges").click();
    await expect
      .poll(
        async () =>
          (await ok<SettingsView>(alice.api, "GET", "/api/settings")).consent.nudges.enabled,
      )
      .toBe(true);

    await page.getByTestId("switch-ai_notes_journal").click();
    await expect
      .poll(
        async () =>
          (await ok<SettingsView>(alice.api, "GET", "/api/settings")).consent.ai_notes_journal
            .enabled,
      )
      .toBe(true);

    await page.getByTestId("switch-nudges").click();
    await expect
      .poll(
        async () =>
          (await ok<SettingsView>(alice.api, "GET", "/api/settings")).consent.nudges.enabled,
      )
      .toBe(false);
    const after = await ok<SettingsView>(alice.api, "GET", "/api/settings");
    expect(after.consent.ai_notes_journal.enabled).toBe(true);
  });

  test("time zone and quiet hours are saved", async ({ alice }) => {
    await openApp(alice, "/settings");
    await alice.page.getByTestId("quiet-start").fill("22:00");
    await alice.page.getByTestId("quiet-end").fill("07:30");
    await alice.page.getByTestId("quiet-save").click();

    await expect
      .poll(async () => {
        const settings = await ok<SettingsView>(alice.api, "GET", "/api/settings");
        return `${settings.quietHours.start}-${settings.quietHours.end}`;
      })
      .toBe("22:00-07:30");
  });

  test("the display controls apply at once, survive a reload and are applied before first paint", async ({
    alice,
  }) => {
    await openApp(alice, "/settings");
    const page = alice.page;
    await page.getByTestId("accessibility-controls").getByText("Largest", { exact: true }).click();
    await page.getByTestId("dyslexia-font").click();
    await page.getByTestId("less-motion").click();

    const attrs = () =>
      page.evaluate(() => {
        const root = document.documentElement;
        return {
          size: root.getAttribute("data-text-size"),
          font: root.getAttribute("data-font"),
          motion: root.getAttribute("data-motion"),
        };
      });
    await expect.poll(attrs).toEqual({ size: "largest", font: "dyslexia", motion: "less" });

    await page.reload();
    await expect.poll(attrs).toEqual({ size: "largest", font: "dyslexia", motion: "less" });
  });

  test("export everything downloads one zip with the person's data", async ({ alice }) => {
    await createTask(alice.api, { title: "Export me", dueDate: todayIso() });
    await openApp(alice, "/settings");

    const downloadPromise = alice.page.waitForEvent("download");
    await alice.page.getByTestId("export-data").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^flowzone-export-\d{4}-\d{2}-\d{2}\.zip$/);

    const path = await download.path();
    const { readFileSync } = await import("node:fs");
    const bytes = readFileSync(path!);
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    expect(bytes.includes(Buffer.from("Export me"))).toBe(true);
  });

  test("delete account removes everything and signs the person out", async ({ alice }) => {
    await createTask(alice.api, { title: "Delete me soon", dueDate: todayIso() });
    const oldId = alice.userId;
    await openApp(alice, "/settings");

    await alice.page.getByTestId("delete-account").click();
    await alice.page.getByTestId("delete-account-input").fill("DELETE");
    await alice.page.getByTestId("delete-account-now").click();
    await expect(alice.page).toHaveURL(/\/sign-in/);

    const old = await call(alice.api, "GET", "/api/tasks");
    expect(old.status).toBe(401);

    // Signing in again with the same name gives a new, empty account.
    const newId = await testLogin(alice.api, alice.name);
    expect(newId).not.toBe(oldId);
    const tasks = await ok<{ tasks: TaskView[] }>(alice.api, "GET", "/api/tasks?status=all");
    expect(tasks.tasks).toHaveLength(0);
  });

  test("the first-run settings are kept and the time zone is set from the device", async ({
    alice,
  }) => {
    await markFirstRunDone(alice.api);
    const settings = await ok<SettingsView & { firstRunCompleted: boolean }>(
      alice.api,
      "GET",
      "/api/settings",
    );
    expect(settings.timeZone).toBe("Europe/Paris");
    expect(settings.firstRunCompleted).toBe(true);
  });
});
