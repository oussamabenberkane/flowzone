/**
 * Falling behind, without guilt: no red states and no "overdue" or day-count wording; the
 * fresh-look queue and its calm actions; repeating tasks that skip silently and never pile up,
 * with a gentle prompt to adjust or pause after repeated skips.
 */
import { expectCalmWording, openApp } from "./support/app";
import { addDaysIso, call, createTask, ok, type TaskView } from "./support/api";
import { expect, test } from "./support/fixtures";

interface RepeatingTask extends TaskView {
  recurrence: { paused: boolean; adjustSuggested: boolean; consecutiveSkips: number } | null;
}

test.describe("falling behind", () => {
  test("a repeating task missed for days shows one current occurrence, never a pile of misses", async ({
    alice,
  }) => {
    const started = addDaysIso(-6);
    const task = await createTask(alice.api, {
      title: "Stretch for five minutes",
      dueDate: started,
      recurrence: { rule: { type: "daily" } },
    });

    const current = await ok<RepeatingTask>(alice.api, "GET", `/api/tasks/${task.id}`);
    // One current occurrence (a single date), not six stacked misses.
    expect(current.dueDate).not.toBeNull();
    expect(current.recurrence?.consecutiveSkips).toBeGreaterThanOrEqual(3);
    expect(current.recurrence?.adjustSuggested).toBe(true);

    await openApp(alice, "/inbox");
    const row = alice.page
      .getByTestId("inbox-task")
      .filter({ hasText: "Stretch for five minutes" });
    await expect(row).toContainText("This one has been quiet for a while. Adjust it or pause it?");
    await expect(row).toHaveCount(1);
    await expectCalmWording(alice.page);
  });

  test("the adjust prompt lets the person pause a repeating task", async ({ alice }) => {
    const task = await createTask(alice.api, {
      title: "Read before bed",
      dueDate: addDaysIso(-6),
      recurrence: { rule: { type: "daily" } },
    });

    await openApp(alice, `/tasks/${task.id}`);
    await expect(
      alice.page.getByText("You can change how often it repeats, pause it, or leave it as it is."),
    ).toBeVisible();
    await alice.page.getByLabel("Pause for now").check({ force: true });
    await alice.page.getByRole("button", { name: "Save changes" }).click();

    await expect
      .poll(
        async () =>
          (await ok<RepeatingTask>(alice.api, "GET", `/api/tasks/${task.id}`)).recurrence?.paused,
      )
      .toBe(true);
  });

  test("a quiet one-off task appears in the fresh look with calm actions that move it", async ({
    alice,
  }) => {
    const task = await createTask(alice.api, {
      title: "Look into the insurance quote",
      dueDate: addDaysIso(-3),
    });
    await openApp(alice, "/today");

    const eddy = alice.page.getByTestId("eddy");
    await expect(eddy).toContainText("They are not urgent. Choose one when you feel like it.");
    await eddy.getByRole("button", { name: "Look at Look into the insurance quote" }).click();

    await alice.page.getByRole("button", { name: "Tomorrow", exact: true }).click();
    await expect(alice.page.getByText("Moved to tomorrow.")).toBeVisible();

    await expect
      .poll(async () => (await ok<TaskView>(alice.api, "GET", `/api/tasks/${task.id}`)).dueDate)
      .toBe(addDaysIso(1));
  });

  test("a quiet task can be let go; it leaves the lists and stays in the export", async ({
    alice,
  }) => {
    const task = await createTask(alice.api, {
      title: "Learn the accordion",
      dueDate: addDaysIso(-4),
    });
    await openApp(alice, "/today");
    await alice.page
      .getByTestId("eddy")
      .getByRole("button", { name: "Look at Learn the accordion" })
      .click();
    await alice.page.getByRole("button", { name: "Let it go", exact: true }).click();
    await alice.page.getByRole("button", { name: "Yes, let it go" }).click();
    await expect(alice.page.getByText("Let go. It's off your lists.")).toBeVisible();

    const gone = await call(alice.api, "GET", `/api/tasks/${task.id}`);
    expect(gone.status).toBe(404);
  });

  test("falling-behind screens use calm words only", async ({ alice }) => {
    await createTask(alice.api, { title: "File the tax return", dueDate: addDaysIso(-10) });
    await openApp(alice, "/today");
    await expectCalmWording(alice.page);
    await alice.page.goto("/inbox");
    await expectCalmWording(alice.page);
  });
});
