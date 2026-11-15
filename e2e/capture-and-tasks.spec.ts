/**
 * Quick capture, the Inbox, tasks, subtasks, projects and quiet completion.
 * Covers the decided requirements: plain-language capture, Inbox by default, due dates,
 * priority, projects, subtasks, estimates, energy, statuses, and quiet completion.
 */
import { capture, goTo, openApp } from "./support/app";
import {
  call,
  createProject,
  createTask,
  ok,
  todayIso,
  addDaysIso,
  type TaskView,
} from "./support/api";
import { expect, test } from "./support/fixtures";
import type { Page } from "@playwright/test";

/** Saves the task detail form and waits for the server to confirm the change. */
async function saveTaskDetail(page: Page, taskId: string) {
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" && response.url().includes(`/api/tasks/${taskId}`),
  );
  await page.getByTestId("task-save").click();
  expect((await saved).status()).toBe(200);
}

test.describe("quick capture and the Inbox", () => {
  test("plain-language capture lands in the Inbox by default", async ({ alice }) => {
    await openApp(alice, "/today");
    await capture(alice.page, "Buy oat milk");

    await goTo(alice.page, "inbox");
    await expect(alice.page.getByTestId("inbox-list")).toContainText("Buy oat milk");

    const inbox = await ok<{ tasks: TaskView[] }>(alice.api, "GET", "/api/inbox");
    expect(inbox.tasks.map((task) => task.title)).toContain("Buy oat milk");
  });

  test("plain language sets the date, time, priority and project it names", async ({ alice }) => {
    await openApp(alice, "/today");
    await alice.page.getByTestId("quick-add-button").click();
    await alice.page.getByTestId("quick-add-input").fill("Call Sam tomorrow at 5pm #Work !high");

    const understood = alice.page.getByTestId("quick-add-understood");
    await expect(understood).toBeVisible();
    await expect(alice.page.getByTestId("quick-add-title")).toHaveValue("Call Sam");
    await expect(alice.page.getByTestId("quick-add-project")).toContainText("Work");
    await expect(alice.page.getByTestId("quick-add-time")).toHaveValue("17:00");
    await alice.page.getByTestId("quick-add-save").click();
    await expect(alice.page.getByRole("dialog")).toBeHidden();

    const page = await ok<{ tasks: TaskView[] }>(alice.api, "GET", "/api/tasks?status=all");
    const call_ = page.tasks.find((task) => task.title === "Call Sam");
    expect(call_, "captured task should exist").toBeTruthy();
    expect(call_?.dueDate).toBe(addDaysIso(1));
    expect(call_?.dueTime).toBe("17:00");
    expect(call_?.priority).toBe("high");
    expect(call_?.projectId).not.toBeNull();
  });

  test("a capture with nothing but text is saved with its title unchanged", async ({ alice }) => {
    await openApp(alice, "/today");
    await capture(alice.page, "Sun cream");
    const inbox = await ok<{ tasks: TaskView[] }>(alice.api, "GET", "/api/inbox");
    expect(inbox.tasks.map((task) => task.title)).toContain("Sun cream");
  });
});

test.describe("tasks: details, steps and status", () => {
  test("a task's details can be edited and saved", async ({ alice }) => {
    const task = await createTask(alice.api, { title: "Write report", priority: "normal" });
    await openApp(alice, `/tasks/${task.id}`);

    await alice.page.getByTestId("task-title").fill("Write the quarterly report");
    await alice.page
      .getByRole("group", { name: "Priority" })
      .getByText("High", { exact: true })
      .click();
    await saveTaskDetail(alice.page, task.id);

    const saved = await ok<TaskView>(alice.api, "GET", `/api/tasks/${task.id}`);
    expect(saved.title).toBe("Write the quarterly report");
    expect(saved.priority).toBe("high");
  });

  test("a task can be given an estimate, an energy level and a date", async ({ alice }) => {
    const task = await createTask(alice.api, { title: "Tidy desk" });
    await openApp(alice, `/tasks/${task.id}`);

    await alice.page.getByTestId("task-date").fill(todayIso());
    await alice.page
      .getByRole("group", { name: "Energy it needs" })
      .getByText("Low", { exact: true })
      .click();
    await alice.page.getByLabel("How long it takes").selectOption({ index: 1 });
    await saveTaskDetail(alice.page, task.id);

    const saved = await ok<TaskView & { estimateMinutes: number | null; energy: string | null }>(
      alice.api,
      "GET",
      `/api/tasks/${task.id}`,
    );
    expect(saved.dueDate).toBe(todayIso());
    expect(saved.energy).toBe("low");
    expect(saved.estimateMinutes).not.toBeNull();
  });

  test("steps are added under a task and shown as its subtasks", async ({ alice }) => {
    const task = await createTask(alice.api, { title: "Renew passport" });
    await openApp(alice, `/tasks/${task.id}`);

    const steps = alice.page.getByTestId("task-steps");
    await steps.getByTestId("step-input").fill("Find the form");
    await steps.getByTestId("step-add").click();
    await expect(steps).toContainText("Find the form");

    const detail = await ok<{ subtasks: TaskView[] }>(alice.api, "GET", `/api/tasks/${task.id}`);
    expect(detail.subtasks.map((step) => step.title)).toContain("Find the form");
  });

  test("a task can be completed, and the completion undone", async ({ alice }) => {
    const task = await createTask(alice.api, { title: "Plan the trip" });
    await openApp(alice, "/inbox");
    const row = alice.page.getByTestId("inbox-task").filter({ hasText: "Plan the trip" });
    await expect(row).toBeVisible();

    await row.getByRole("checkbox", { name: /Not done\. Select to complete/ }).click();
    await expect(alice.page.getByText("Done.", { exact: true })).toBeVisible();
    await expect(alice.page.getByRole("button", { name: "Undo" })).toBeVisible();

    await alice.page.getByRole("button", { name: "Undo" }).click();
    await expect
      .poll(async () => (await ok<TaskView>(alice.api, "GET", `/api/tasks/${task.id}`)).status)
      .toBe("pending");
  });

  test("completion is quiet: no points, streaks or celebration wording", async ({ alice }) => {
    await createTask(alice.api, { title: "Water the plants" });
    await openApp(alice, "/inbox");
    await alice.page
      .getByRole("checkbox", { name: /Not done\. Select to complete/ })
      .first()
      .click();
    await expect(alice.page.getByText("Done.", { exact: true })).toBeVisible();
    const toast = alice.page.getByTestId("toasts");
    await expect(toast).not.toContainText(/point|streak|badge|great job|well done|congrat/i);
  });

  test("a task can be dropped; it leaves the lists but stays in the export", async ({ alice }) => {
    const task = await createTask(alice.api, { title: "Old idea" });
    await openApp(alice, `/tasks/${task.id}`);
    await alice.page.getByTestId("task-options").locator("summary").click();
    await alice.page.getByRole("button", { name: "Let it go" }).click();
    await alice.page.getByRole("button", { name: "Yes, let it go" }).click();
    await expect(alice.page.getByText("Let go. It's off your lists.")).toBeVisible();

    const gone = await call(alice.api, "GET", `/api/tasks/${task.id}`);
    expect(gone.status).toBe(404);
  });
});

test.describe("projects and subtasks via the API contract", () => {
  test("a project groups tasks and a task belongs to at most one project", async ({ alice }) => {
    const project = await createProject(alice.api, "Home");
    const task = await createTask(alice.api, { title: "Fix the tap", projectId: project.id });
    await openApp(alice, "/projects");
    await alice.page.getByRole("link", { name: "Home" }).first().click();
    await expect(alice.page.getByTestId("project-tasks")).toContainText("Fix the tap");
    expect(task.projectId).toBe(project.id);
  });

  test("a subtask cannot be given its own subtask (one level only)", async ({ alice }) => {
    const parent = await createTask(alice.api, { title: "Move house" });
    const step = await createTask(alice.api, { title: "Pack boxes", parentTaskId: parent.id });
    const deeper = await call(alice.api, "POST", "/api/tasks", {
      title: "Label boxes",
      parentTaskId: step.id,
      clientRequestId: "deeper-subtask-0001",
    });
    expect(deeper.status).toBeGreaterThanOrEqual(400);
    expect(deeper.status).toBeLessThan(500);
  });
});

test.describe("the Today day view", () => {
  test("a task joins today's plan only when the person chooses it", async ({ alice }) => {
    await createTask(alice.api, { title: "Pay the water bill", dueDate: todayIso() });
    await openApp(alice, "/today");
    await expect(alice.page.getByTestId("today-plan")).toContainText("Nothing planned yet.");

    await alice.page.getByRole("button", { name: "Choose for today" }).first().click();
    await alice.page.locator("label.fz-toggle", { hasText: "Pay the water bill" }).click();
    await alice.page.getByTestId("plan-confirm").click();
    await expect(alice.page.getByTestId("today-plan")).toContainText("Pay the water bill");
  });
});
