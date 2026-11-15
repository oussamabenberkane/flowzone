/**
 * Today (the plan, the once-a-day prompt) and Focus mode (one task, an optional timer,
 * park-a-thought, quiet completion).
 */
import { expectCalmWording, openApp } from "./support/app";
import { call, createTask, ok, todayIso, type TaskView } from "./support/api";
import { expect, test } from "./support/fixtures";

test.describe("Today", () => {
  test("the plan-my-day prompt is optional and can be dismissed for the day", async ({ alice }) => {
    await createTask(alice.api, { title: "Send the invoice", dueDate: todayIso() });
    await openApp(alice, "/today");

    const prompt = alice.page.getByTestId("plan-prompt");
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText("Plan your day?");

    await alice.page.getByRole("button", { name: "Not today" }).click();
    await expect(prompt).toBeHidden();

    // Dismissed for today on this device: it does not come back on reload.
    await alice.page.reload();
    await expect(alice.page.getByTestId("nav-today")).toBeVisible();
    await expect(alice.page.getByTestId("plan-prompt")).toBeHidden();
  });

  test("the plan is only what the person chose, and is editable", async ({ alice }) => {
    const first = await createTask(alice.api, { title: "Reply to Maya", dueDate: todayIso() });
    await createTask(alice.api, { title: "Book the dentist", dueDate: todayIso() });
    await openApp(alice, "/today");

    await alice.page.getByRole("button", { name: "Choose for today" }).first().click();
    await alice.page.locator("label.fz-toggle", { hasText: "Reply to Maya" }).click();
    await alice.page.locator("label.fz-toggle", { hasText: "Book the dentist" }).click();
    await alice.page.getByTestId("plan-confirm").click();

    const plan = alice.page.getByTestId("today-plan");
    await expect(plan).toContainText("Reply to Maya");
    await expect(plan).toContainText("Book the dentist");

    // Take one off today's plan with its own control.
    await alice.page
      .getByRole("button", { name: "Take Book the dentist off today's plan" })
      .click();
    await expect(plan).not.toContainText("Book the dentist");

    await expect
      .poll(async () => {
        const saved = await ok<{ tasks: TaskView[] }>(alice.api, "GET", `/api/plans/${todayIso()}`);
        return saved.tasks.map((task) => task.id);
      })
      .toEqual([first.id]);
  });

  test("Today shows calm wording only", async ({ alice }) => {
    await createTask(alice.api, { title: "Water the basil", dueDate: todayIso() });
    await openApp(alice, "/today");
    await expectCalmWording(alice.page);
  });
});

test.describe("Focus mode", () => {
  test("Focus shows one task; the timer stays off until it is started", async ({ alice }) => {
    const task = await createTask(alice.api, { title: "Draft the newsletter" });
    await openApp(alice, `/focus/${task.id}`);

    const focus = alice.page.getByTestId("focus-screen");
    await expect(focus).toContainText("Draft the newsletter");
    await expect(alice.page.getByTestId("timer")).toHaveCount(0);
    await expect(alice.page.getByTestId("timer-start")).toBeVisible();
    await expect(focus).toContainText("The timer is off until you start it.");

    await alice.page.getByTestId("timer-start").click();
    await expect(alice.page.getByTestId("timer")).toBeVisible();
  });

  test("park-a-thought saves a note linked to the task and keeps focus", async ({ alice }) => {
    const task = await createTask(alice.api, { title: "Plan the workshop" });
    await openApp(alice, `/focus/${task.id}`);

    await alice.page.getByTestId("park-input").fill("Maybe ask Ana about the room");
    await alice.page.getByTestId("park-save").click();
    await expect(alice.page.getByTestId("focus-screen")).toContainText("Plan the workshop");

    await expect
      .poll(async () => {
        const linked = await ok<{ entries: Array<{ body: string | null; taskId: string | null }> }>(
          alice.api,
          "GET",
          `/api/entries?taskId=${task.id}`,
        );
        return linked.entries.find((entry) => entry.body === "Maybe ask Ana about the room")
          ?.taskId;
      })
      .toBe(task.id);
  });

  test("completing from Focus is quiet: 'Done.' with no points, streaks or confetti", async ({
    alice,
  }) => {
    const task = await createTask(alice.api, { title: "Sort the receipts" });
    await openApp(alice, `/focus/${task.id}`);

    await alice.page.getByRole("checkbox", { name: /Not done\. Select to complete/ }).click();
    await expect(alice.page.getByTestId("focus-screen")).toContainText("Done. Nicely finished.");
    await expect(alice.page.getByTestId("focus-screen")).not.toContainText(
      /point|streak|badge|confetti/i,
    );

    const done = await ok<TaskView>(alice.api, "GET", `/api/tasks/${task.id}`);
    expect(done.status).toBe("completed");
  });

  test("a completed task can be reopened from Focus", async ({ alice }) => {
    const task = await createTask(alice.api, { title: "Return the library book" });
    await ok(alice.api, "POST", `/api/tasks/${task.id}/complete`, {});
    await openApp(alice, `/focus/${task.id}`);
    await alice.page.getByRole("button", { name: "Reopen it" }).click();
    await expect
      .poll(
        async () => (await call<TaskView>(alice.api, "GET", `/api/tasks/${task.id}`)).body.status,
      )
      .toBe("pending");
  });
});
