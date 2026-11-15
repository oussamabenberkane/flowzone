/**
 * Notes and the journal: one concept with two entry points, and the optional end-of-day
 * reflection that is stored as a journal entry.
 */
import { openApp, goTo } from "./support/app";
import { ok, todayIso } from "./support/api";
import { expect, test } from "./support/fixtures";

interface EntryRow {
  id: string;
  kind: "note" | "journal";
  body: string | null;
  title: string | null;
  entryDate: string;
}

test.describe("notes and journal", () => {
  test("a note and a journal entry are saved through two entry points", async ({ alice }) => {
    await openApp(alice, "/notes");
    await alice.page.getByTestId("new-note").click();
    await alice.page.getByTestId("entry-body").fill("The gate code is in the blue folder");
    await alice.page.getByTestId("entry-save").click();
    // Saving a note leaves the editor; wait for the notes list before using it again.
    await expect(alice.page).toHaveURL(/\/notes(\?.*)?$/);

    await goTo(alice.page, "notes");
    await alice.page.getByTestId("new-journal").click();
    await expect(alice.page).toHaveURL(/kind=journal/);
    await alice.page.getByTestId("entry-body").fill("A quiet morning, two walks.");
    await alice.page.getByTestId("entry-save").click();

    await expect
      .poll(async () => {
        const notes = await ok<{ entries: EntryRow[] }>(alice.api, "GET", "/api/entries?kind=note");
        return notes.entries.map((entry) => entry.body);
      })
      .toContain("The gate code is in the blue folder");
    await expect
      .poll(async () => {
        const journal = await ok<{ entries: EntryRow[] }>(
          alice.api,
          "GET",
          "/api/entries?kind=journal",
        );
        return journal.entries.map((entry) => entry.body);
      })
      .toContain("A quiet morning, two walks.");
  });

  test("the notes list shows both kinds together", async ({ alice }) => {
    await openApp(alice, "/notes");
    await alice.page.getByTestId("new-note").click();
    await alice.page.getByTestId("entry-title").fill("Shopping ideas");
    await alice.page.getByTestId("entry-body").fill("Lentils, lemons");
    await alice.page.getByTestId("entry-save").click();

    await goTo(alice.page, "notes");
    await expect(alice.page.getByTestId("notes-list")).toContainText("Shopping ideas");
  });

  test("the evening reflection is an optional prompt, saved as a journal entry for the day", async ({
    alice,
  }) => {
    // The reflection appears from 19:00 on the device clock (Europe/Paris in this suite).
    await alice.page.clock.setFixedTime(new Date(`${todayIso()}T20:30:00+01:00`));
    await openApp(alice, "/today");

    const card = alice.page.getByTestId("reflection-card");
    await expect(card).toContainText("A moment for the day?");
    await card.getByRole("link", { name: "Write a few lines" }).click();

    await alice.page.getByTestId("entry-body").fill("Slept well. Finished the draft.");
    await alice.page.getByTestId("entry-save").click();

    await expect
      .poll(async () => {
        const journal = await ok<{ entries: EntryRow[] }>(
          alice.api,
          "GET",
          `/api/entries?kind=journal&from=${todayIso()}&to=${todayIso()}`,
        );
        return journal.entries.find((row) => row.body === "Slept well. Finished the draft.")
          ?.entryDate;
      })
      .toBe(todayIso());
  });

  test("the reflection can be skipped for the day", async ({ alice }) => {
    await alice.page.clock.setFixedTime(new Date(`${todayIso()}T20:30:00+01:00`));
    await openApp(alice, "/today");
    const card = alice.page.getByTestId("reflection-card");
    await card.getByRole("button", { name: "Skip for today" }).click();
    await expect(card).toBeHidden();

    await alice.page.reload();
    await expect(alice.page.getByTestId("nav-today")).toBeVisible();
    await expect(alice.page.getByTestId("reflection-card")).toBeHidden();
  });
});
