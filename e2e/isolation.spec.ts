/**
 * Two-person isolation, proved with direct API requests (foundation.md section 2).
 *
 * Alice creates one of every kind of user-owned resource. Bob, signed in on his own account,
 * then tries to read, change and delete each one by its id, and to see it in his lists and
 * his export. Every attempt must be refused as "not found" (404), which is the same answer
 * as for an id that does not exist, so nothing reveals that the item exists.
 */
import { randomBytes } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { call, createEntry, createProject, createTask, ok, todayIso } from "./support/api";
import { expect, test } from "./support/fixtures";
import { makeDeviceKeys } from "./support/push-decrypt";
import { PUSH_STUB_ORIGIN } from "./support/env";

interface Ids {
  taskId: string;
  projectId: string;
  entryId: string;
  messageId: string;
  actionId: string;
  profileId: string;
  deviceId: string;
  taskTitle: string;
}

async function prepareAlice(api: APIRequestContext): Promise<Ids> {
  await ok(api, "PATCH", "/api/settings/consent", {
    ai_features: true,
    ai_profile: true,
    nudges: true,
  });
  const taskTitle = `Alice private ${randomBytes(3).toString("hex")}`;
  const task = await createTask(api, { title: taskTitle, dueDate: todayIso(), dueTime: "16:00" });
  const project = await createProject(api, `Alice project ${randomBytes(3).toString("hex")}`);
  const entry = await createEntry(api, { kind: "note", body: "Alice private note text" });
  await ok(api, "PUT", `/api/plans/${todayIso()}`, { taskIds: [task.id], confirmed: false });

  // One chat message that is applied at once, and one confirm-tier change waiting for a yes.
  const chatResponse = await api.fetch("/api/ai/chat/messages", {
    method: "POST",
    data: { text: `delete ${taskTitle}` },
  });
  expect(chatResponse.status()).toBe(200);
  const history = await ok<{ messages: Array<{ id: string; role: string }> }>(
    api,
    "GET",
    "/api/ai/chat",
  );
  const messageId = history.messages.find((message) => message.role === "user")?.id ?? "";
  const pending = await ok<{ actions: Array<{ id: string; status: string }> }>(
    api,
    "GET",
    "/api/ai/actions/pending",
  );
  const actionId = pending.actions.find((action) => action.status === "pending")?.id ?? "";

  const profile = await ok<{ id: string }>(api, "POST", "/api/ai/profile", {
    text: "Alice likes mornings",
  });

  await ok(api, "PUT", `/api/nudges/tasks/${task.id}`, { muted: true });
  const device = await ok<{ id: string }>(api, "POST", "/api/nudges/devices", {
    endpoint: `${PUSH_STUB_ORIGIN}/push/ok/isolation-${randomBytes(4).toString("hex")}`,
    keys: { p256dh: makeDeviceKeys().p256dh, auth: randomBytes(16).toString("base64url") },
    label: "Alice device",
  });

  expect(messageId, "a chat message should exist").not.toBe("");
  expect(actionId, "a pending action should exist").not.toBe("");

  return {
    taskId: task.id,
    projectId: project.id,
    entryId: entry.id,
    messageId,
    actionId,
    profileId: profile.id,
    deviceId: device.id,
    taskTitle,
  };
}

test.describe("two people cannot reach each other's data", () => {
  test("bob cannot read, change or delete any of alice's items by id", async ({ alice, bob }) => {
    const ids = await prepareAlice(alice.api);
    const d = todayIso();

    const attempts: Array<[string, "GET" | "PATCH" | "DELETE" | "POST" | "PUT", string, unknown?]> =
      [
        ["task read", "GET", `/api/tasks/${ids.taskId}`],
        ["task change", "PATCH", `/api/tasks/${ids.taskId}`, { title: "Hijacked" }],
        ["task complete", "POST", `/api/tasks/${ids.taskId}/complete`, {}],
        ["task drop", "POST", `/api/tasks/${ids.taskId}/drop`, {}],
        ["task snooze", "POST", `/api/tasks/${ids.taskId}/snooze`, {}],
        ["task delete", "DELETE", `/api/tasks/${ids.taskId}`],
        ["project read", "GET", `/api/projects/${ids.projectId}`],
        ["project change", "PATCH", `/api/projects/${ids.projectId}`, { name: "Hijacked" }],
        ["project delete", "DELETE", `/api/projects/${ids.projectId}`],
        ["entry read", "GET", `/api/entries/${ids.entryId}`],
        ["entry change", "PATCH", `/api/entries/${ids.entryId}`, { body: "Hijacked" }],
        ["entry delete", "DELETE", `/api/entries/${ids.entryId}`],
        [
          "plan with alice's task",
          "PUT",
          `/api/plans/${d}`,
          { taskIds: [ids.taskId], confirmed: true },
        ],
        ["chat message delete", "DELETE", `/api/ai/chat/messages/${ids.messageId}`],
        ["action confirm", "POST", `/api/ai/actions/${ids.actionId}/confirm`, {}],
        ["action reject", "POST", `/api/ai/actions/${ids.actionId}/reject`, {}],
        ["action undo", "POST", `/api/ai/actions/${ids.actionId}/undo`, {}],
        ["profile item change", "PATCH", `/api/ai/profile/${ids.profileId}`, { text: "Hijacked" }],
        ["profile item accept", "POST", `/api/ai/profile/${ids.profileId}/accept`, {}],
        ["profile item delete", "DELETE", `/api/ai/profile/${ids.profileId}`],
        ["nudge control read", "GET", `/api/nudges/tasks/${ids.taskId}`],
        ["nudge control change", "PUT", `/api/nudges/tasks/${ids.taskId}`, { muted: false }],
        ["nudge device delete", "DELETE", `/api/nudges/devices/${ids.deviceId}`],
        [
          "breakdown of alice's task",
          "POST",
          `/api/tasks/${ids.taskId}/breakdown`,
          { steps: [{ title: "x" }] },
        ],
      ];

    const leaks: string[] = [];
    for (const [label, method, path, data] of attempts) {
      const result = await call(bob.api, method, path, data);
      // A plan update names the task ids it was given. An unknown or someone else's id is a
      // validation error (400) that says nothing about the task, so 400 is accepted for plans.
      const refused = label.startsWith("plan") ? [400, 404] : [404];
      if (!refused.includes(result.status))
        leaks.push(`${label}: ${method} ${path} answered ${result.status}`);
      if (result.text.includes(ids.taskTitle))
        leaks.push(`${label}: the answer shows alice's title`);
    }
    expect(leaks, "every cross-user attempt must be 'not found'").toEqual([]);

    // Alice's data is intact.
    const stillThere = await ok<{ title: string }>(alice.api, "GET", `/api/tasks/${ids.taskId}`);
    expect(stillThere.title).toBe(ids.taskTitle);
  });

  test("bob's lists and history never include alice's items", async ({ alice, bob }) => {
    const ids = await prepareAlice(alice.api);

    const tasks = await ok<{ tasks: Array<{ title: string }> }>(
      bob.api,
      "GET",
      "/api/tasks?status=all",
    );
    expect(tasks.tasks.map((task) => task.title)).not.toContain(ids.taskTitle);

    const projects = await ok<{ projects: Array<{ id: string }> }>(bob.api, "GET", "/api/projects");
    expect(projects.projects.map((project) => project.id)).not.toContain(ids.projectId);

    const entries = await ok<{ entries: Array<{ id: string }> }>(bob.api, "GET", "/api/entries");
    expect(entries.entries.map((entry) => entry.id)).not.toContain(ids.entryId);

    const chat = await ok<{ messages: Array<{ id: string }> }>(bob.api, "GET", "/api/ai/chat");
    expect(chat.messages.map((message) => message.id)).not.toContain(ids.messageId);

    const actions = await ok<{ actions: Array<{ id: string }> }>(bob.api, "GET", "/api/ai/actions");
    expect(actions.actions.map((action) => action.id)).not.toContain(ids.actionId);

    const pending = await ok<{ actions: Array<{ id: string }> }>(
      bob.api,
      "GET",
      "/api/ai/actions/pending",
    );
    expect(pending.actions.map((action) => action.id)).not.toContain(ids.actionId);

    const profile = await ok<{ items: Array<{ id: string }> }>(bob.api, "GET", "/api/ai/profile");
    expect(profile.items.map((item) => item.id)).not.toContain(ids.profileId);

    const devices = await ok<{ devices: Array<{ id: string }> }>(
      bob.api,
      "GET",
      "/api/nudges/devices",
    );
    expect(devices.devices.map((device) => device.id)).not.toContain(ids.deviceId);

    const plan = await ok<{ tasks: Array<{ id: string }> }>(
      bob.api,
      "GET",
      `/api/plans/${todayIso()}`,
    );
    expect(plan.tasks.map((task) => task.id)).not.toContain(ids.taskId);
  });

  test("bob's data export does not contain alice's data, and alice's does", async ({
    alice,
    bob,
  }) => {
    const ids = await prepareAlice(alice.api);

    const aliceExport = await alice.api.get("/api/account/export");
    expect(aliceExport.status()).toBe(200);
    const aliceBytes = await aliceExport.body();
    expect(aliceBytes.includes(Buffer.from(ids.taskTitle))).toBe(true);

    const bobExport = await bob.api.get("/api/account/export");
    expect(bobExport.status()).toBe(200);
    const bobBytes = await bobExport.body();
    expect(bobBytes.includes(Buffer.from(ids.taskTitle))).toBe(false);
    expect(bobBytes.includes(Buffer.from("Alice private note text"))).toBe(false);
  });

  test("settings and switches belong to each person", async ({ alice, bob }) => {
    await ok(alice.api, "PATCH", "/api/settings/consent", { ai_features: true });
    const bobSettings = await ok<{ consent: Record<string, { enabled: boolean }> }>(
      bob.api,
      "GET",
      "/api/settings",
    );
    expect(bobSettings.consent.ai_features.enabled).toBe(false);
    const bobChat = await call(bob.api, "POST", "/api/ai/chat/messages", { text: "add Bob task" });
    expect(bobChat.body).toMatchObject({ available: false, reason: "not_opted_in" });
  });
});
