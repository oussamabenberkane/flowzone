/**
 * AI (opt-in, using the scripted stand-in so no real AI quota is used). Covers the opt-in
 * switches and first-run choices, the chat, risk tiers (low applied with undo; confirm-tier
 * pending until confirmed), persistent history and clearing, and the calm "AI is resting" states.
 *
 * Stand-in phrases are in docs/contracts/ai.md, section 14.
 */
import { openApp } from "./support/app";
import { call, createTask, ok, todayIso, type TaskView } from "./support/api";
import { expect, test } from "./support/fixtures";
import type { APIRequestContext, Page } from "@playwright/test";

type Consent = Partial<
  Record<"ai_features" | "ai_notes_journal" | "ai_profile" | "nudges", boolean>
>;

/** Sets the four switches through the API (api.md 4.7). */
async function setConsent(api: APIRequestContext, consent: Consent): Promise<void> {
  await ok(api, "PATCH", "/api/settings/consent", consent);
}

/** Sends one chat message through the streaming endpoint and returns the events. */
async function chat(api: APIRequestContext, text: string): Promise<Array<Record<string, unknown>>> {
  const response = await api.fetch("/api/ai/chat/messages", { method: "POST", data: { text } });
  expect(response.status()).toBe(200);
  const body = await response.text();
  return body
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** Opens the Ask sheet from the top bar. */
async function openAssistant(page: Page): Promise<void> {
  await page.getByTestId("assistant-button").click();
  await expect(page.getByTestId("assistant-sheet")).toBeVisible();
}

async function askAssistant(page: Page, text: string): Promise<void> {
  await page.getByTestId("assistant-input").fill(text);
  await page.getByTestId("assistant-send").click();
  await expect(page.getByTestId("assistant-announcer")).toContainText("FlowZone replied", {
    timeout: 15_000,
  });
}

test.describe("opt-in and the first-run choices", () => {
  test("first run shows the four switches, all off, and skipping never blocks", async ({
    alice,
  }) => {
    await openApp(alice, "/today", { keepFirstRun: true });
    const sheet = alice.page.getByTestId("first-run-sheet");
    await expect(sheet).toBeVisible();
    for (const key of ["ai_features", "ai_notes_journal", "ai_profile", "nudges"]) {
      await expect(alice.page.getByTestId(`first-run-${key}`)).toBeVisible();
    }

    const settings = await ok<{ consent: Record<string, { enabled: boolean }> }>(
      alice.api,
      "GET",
      "/api/settings",
    );
    expect(Object.values(settings.consent).every((value) => value.enabled === false)).toBe(true);

    await alice.page.getByTestId("first-run-skip").click();
    await expect(sheet).toBeHidden();
    await expect(alice.page.getByTestId("nav-today")).toBeVisible();
  });

  test("with every switch off, no AI surface appears and the app is a plain todo app", async ({
    alice,
  }) => {
    await createTask(alice.api, { title: "Plain task", dueDate: todayIso() });
    await openApp(alice, "/today");
    await expect(alice.page.getByTestId("assistant-button")).toHaveCount(0);
    await expect(alice.page.getByTestId("plan-ai")).toHaveCount(0);
    await expect(alice.page.getByTestId("reflection-card")).toHaveCount(0);

    await alice.page.getByTestId("quick-add-button").click();
    await alice.page.getByTestId("quick-add-input").fill("Plain capture");
    await expect(alice.page.getByTestId("capture-hint")).toHaveCount(0);
    await alice.page.keyboard.press("Escape");

    await alice.page.goto("/settings");
    await expect(alice.page.getByTestId("ai-choices")).toBeVisible();
    await expect(alice.page.getByTestId("ai-usage")).toHaveCount(0);
  });

  test("the chat is refused with 'not opted in' while the switch is off", async ({ alice }) => {
    const response = await call(alice.api, "POST", "/api/ai/chat/messages", {
      text: "add Buy bread",
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ available: false, reason: "not_opted_in" });
    const history = await ok<{ messages: unknown[] }>(alice.api, "GET", "/api/ai/chat");
    expect(history.messages).toHaveLength(0);
  });

  test("turning on Tasks and chat in Settings shows the Ask button at once", async ({ alice }) => {
    await openApp(alice, "/settings");
    await alice.page.getByTestId("switch-ai_features").click();
    await expect(alice.page.getByTestId("assistant-button")).toBeVisible();
    await alice.page.getByTestId("switch-ai_features").click();
    await expect(alice.page.getByTestId("assistant-button")).toHaveCount(0);
  });
});

test.describe("chat and risk tiers", () => {
  test.beforeEach(async ({ alice }) => {
    await setConsent(alice.api, { ai_features: true, ai_notes_journal: true });
  });

  test("a low-risk change is applied at once and can be undone", async ({ alice }) => {
    await openApp(alice, "/today");
    await openAssistant(alice.page);
    await askAssistant(alice.page, "add Buy bread");

    const card = alice.page.getByTestId("action-card").last();
    await expect(card).toHaveAttribute("data-status", /applied/);
    await expect(card).toHaveAttribute("data-tier", "low");
    await card.getByTestId("action-undo").click();

    await expect
      .poll(async () => {
        const all = await ok<{ tasks: TaskView[] }>(alice.api, "GET", "/api/tasks?status=all");
        return all.tasks.some((task) => task.title === "Buy bread");
      })
      .toBe(false);
  });

  test("deleting a task waits for a tap: confirm removes it", async ({ alice }) => {
    const task = await createTask(alice.api, { title: "Old shopping list" });
    const events = await chat(alice.api, "delete Old shopping list");
    expect(JSON.stringify(events)).toContain("pending");

    const pending = await ok<{ actions: Array<{ id: string; status: string; tier: string }> }>(
      alice.api,
      "GET",
      "/api/ai/actions/pending",
    );
    const action = pending.actions.find((item) => item.status === "pending");
    expect(action?.tier).toBe("confirm");
    await ok(alice.api, "POST", `/api/ai/actions/${action?.id}/confirm`, {});

    const gone = await call(alice.api, "GET", `/api/tasks/${task.id}`);
    expect(gone.status).toBe(404);
  });

  test("rejecting a pending change leaves the task as it was", async ({ alice }) => {
    const task = await createTask(alice.api, { title: "Keep this one" });
    await chat(alice.api, "delete Keep this one");
    const pending = await ok<{ actions: Array<{ id: string; status: string }> }>(
      alice.api,
      "GET",
      "/api/ai/actions/pending",
    );
    const action = pending.actions.find((item) => item.status === "pending");
    await ok(alice.api, "POST", `/api/ai/actions/${action?.id}/reject`, {});

    const kept = await ok<TaskView>(alice.api, "GET", `/api/tasks/${task.id}`);
    expect(kept.title).toBe("Keep this one");
  });

  test("bulk completion and moving more than three items wait for a yes", async ({ alice }) => {
    await createTask(alice.api, { title: "One", dueDate: todayIso() });
    await createTask(alice.api, { title: "Two", dueDate: todayIso() });
    await createTask(alice.api, { title: "Three", dueDate: todayIso() });
    const events = await chat(alice.api, "bulk complete");
    expect(JSON.stringify(events)).toContain("pending");

    const open = await ok<{ tasks: TaskView[] }>(alice.api, "GET", "/api/tasks?status=open");
    expect(open.tasks.filter((task) => ["One", "Two", "Three"].includes(task.title))).toHaveLength(
      3,
    );

    await chat(alice.api, "plan all");
    const pending = await ok<{ actions: Array<{ status: string; tier: string }> }>(
      alice.api,
      "GET",
      "/api/ai/actions/pending",
    );
    expect(
      pending.actions.some((item) => item.status === "pending" && item.tier === "confirm"),
    ).toBe(true);
  });

  test("a note is saved as a low-risk change", async ({ alice }) => {
    await openApp(alice, "/today");
    await openAssistant(alice.page);
    await askAssistant(alice.page, "note The pharmacy closes at six");
    await expect(alice.page.getByTestId("action-card").last()).toHaveAttribute(
      "data-status",
      /applied/,
    );
    const notes = await ok<{ entries: Array<{ body: string | null }> }>(
      alice.api,
      "GET",
      "/api/entries",
    );
    expect(notes.entries.map((entry) => entry.body)).toContain("The pharmacy closes at six");
  });

  test("chat history persists across a reload and can be cleared", async ({ alice }) => {
    await openApp(alice, "/today");
    await openAssistant(alice.page);
    await askAssistant(alice.page, "hello there");
    await expect(alice.page.getByTestId("chat-message-user")).toContainText("hello there");

    await alice.page.reload();
    await openAssistant(alice.page);
    await expect(alice.page.getByTestId("assistant-thread")).toContainText("hello there");

    await alice.page.getByTestId("chat-clear").click();
    await alice.page.getByTestId("chat-clear-confirm").click();
    await expect(alice.page.getByTestId("assistant-thread")).not.toContainText("hello there");
    const history = await ok<{ messages: unknown[] }>(alice.api, "GET", "/api/ai/chat");
    expect(history.messages).toHaveLength(0);
  });
});

test.describe("calm resting states", () => {
  test.beforeEach(async ({ alice }) => {
    await setConsent(alice.api, { ai_features: true });
  });

  test("a provider failure shows 'AI is resting' calmly and keeps the person's text", async ({
    alice,
  }) => {
    await openApp(alice, "/today");
    await openAssistant(alice.page);
    await alice.page.getByTestId("assistant-input").fill("error");
    await alice.page.getByTestId("assistant-send").click();
    await expect(alice.page.getByText(/AI is resting for now/)).toBeVisible();
    await expect(alice.page.getByTestId("assistant-input")).toHaveValue("error");
  });

  test("a rate-limited provider reports resting, not an error", async ({ alice }) => {
    const events = await chat(alice.api, "rest");
    expect(JSON.stringify(events)).toMatch(/rest|provider_down|resting/);
    const status = await ok<{ available: boolean }>(alice.api, "GET", "/api/ai/status");
    expect(status.available).toBe(true);
  });

  test("the daily limit answers 'daily_limit' after the cap and ordinary app use still works", async ({
    alice,
  }) => {
    // The test server's default daily allowance is 30 AI requests per person.
    let last: Record<string, unknown> = {};
    for (let i = 0; i < 31; i += 1) {
      const events = await chat(alice.api, `hello ${i}`);
      last = events.at(-1) ?? {};
    }
    expect(JSON.stringify(last)).toMatch(/daily_limit|resting/);
    const tasks = await call(alice.api, "GET", "/api/tasks");
    expect(tasks.status).toBe(200);
  });
});

test.describe("profile proposals", () => {
  test("a profile proposal needs the person's acceptance before it is used", async ({ alice }) => {
    await setConsent(alice.api, { ai_features: true, ai_profile: true });
    await chat(alice.api, "remember I work best in the mornings");
    const before = await ok<{ items: Array<{ id: string; status: string; text: string }> }>(
      alice.api,
      "GET",
      "/api/ai/profile",
    );
    const proposal = before.items.find((item) => item.status === "proposed");
    expect(proposal, "the stand-in should propose a profile item").toBeTruthy();

    await ok(alice.api, "POST", `/api/ai/profile/${proposal?.id}/accept`, {});
    const after = await ok<{ items: Array<{ id: string; status: string }> }>(
      alice.api,
      "GET",
      "/api/ai/profile",
    );
    expect(after.items.find((item) => item.id === proposal?.id)?.status).toBe("accepted");
  });

  test("the profile is visible, editable and deletable by the person", async ({ alice }) => {
    await setConsent(alice.api, { ai_features: true, ai_profile: true });
    await openApp(alice, "/settings");
    await alice.page.getByTestId("profile-add-input").fill("Prefers short emails");
    await alice.page.getByTestId("profile-add").click();
    await expect(alice.page.getByTestId("profile-list")).toContainText("Prefers short emails");

    await alice.page
      .getByTestId("profile-item")
      .filter({ hasText: "Prefers short emails" })
      .getByTestId("profile-delete")
      .click();
    await expect(
      alice.page.getByTestId("profile-item").filter({ hasText: "Prefers short emails" }),
    ).toHaveCount(0);
  });
});
