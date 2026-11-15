/**
 * Nudges, run through the tick endpoint with the test-only time parameter (?asOf=).
 *
 * A device is registered with a real push key pair. Pushes go to the local HTTPS stub, which
 * records them; each one is decrypted here, so the tests can check the reason and the wording.
 * The tick response counts people across the whole test database (other tests run in
 * parallel), so every assertion below looks at THIS person's device pushes, never at the totals.
 *
 * Known defect D-01: the scheduler's call is refused by src/proxy.ts (no session cookie). The
 * test for that path is marked with test.fail() so it stays visible until the defect is fixed.
 */
import { randomBytes } from "node:crypto";
import { request } from "@playwright/test";
import { BASE_URL, PUSH_STUB_ORIGIN, TICK_SECRET } from "./support/env";
import { call, createTask, ok, todayIso } from "./support/api";
import { decryptPush, makeDeviceKeys, type DeviceKeys } from "./support/push-decrypt";
import { pushesFor } from "./support/push-stub";
import { expect, test } from "./support/fixtures";
import { GUILT_WORDS } from "./support/app";
import type { APIRequestContext } from "@playwright/test";

interface Device {
  id: string;
  endpoint: string;
  keys: DeviceKeys;
  pathId: string;
}

/** Registers a push device for the person, pointed at the local stub with a chosen outcome. */
async function registerDevice(
  api: APIRequestContext,
  mode: "ok" | "gone" | "fail" = "ok",
): Promise<Device> {
  const pathId = `dev-${randomBytes(6).toString("hex")}`;
  const keys = makeDeviceKeys();
  const endpoint = `${PUSH_STUB_ORIGIN}/push/${mode}/${pathId}`;
  const device = await ok<{ id: string }>(api, "POST", "/api/nudges/devices", {
    endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    label: "Test device",
  });
  return { id: device.id, endpoint, keys, pathId };
}

async function setNudges(api: APIRequestContext, on: boolean): Promise<void> {
  await ok(api, "PATCH", "/api/settings/consent", { nudges: on });
}

/** Runs one tick at a test time, as the scheduler would (with the secret), as this person's session. */
async function tickAt(api: APIRequestContext, asOf: string) {
  return call<Record<string, unknown>>(
    api,
    "POST",
    `/api/nudges/tick?asOf=${encodeURIComponent(asOf)}`,
    undefined,
    {
      "x-flowzone-tick-secret": TICK_SECRET,
    },
  );
}

/** Paris local time today at the given HH:MM, as an ISO instant. */
function parisAt(hhmm: string): string {
  return `${todayIso()}T${hhmm}:00+01:00`;
}

/** Decrypted texts of every push this device received (delivered ones only). */
function delivered(device: Device): string[] {
  return pushesFor(device.pathId)
    .filter((record) => record.status === 201)
    .map((record) => decryptPush(record.body, device.keys));
}

test.describe("nudges through the tick", () => {
  test("nothing is sent while the nudges switch is off, even at a due time", async ({ alice }) => {
    await setNudges(alice.api, true);
    await createTask(alice.api, { title: "Call the vet", dueDate: todayIso(), dueTime: "16:00" });
    const device = await registerDevice(alice.api);
    await setNudges(alice.api, false);

    const result = await tickAt(alice.api, parisAt("14:00"));
    expect(result.status).toBe(200);
    expect(delivered(device)).toHaveLength(0);
  });

  test("a due-soon task is nudged once, and the nudge says why", async ({ alice }) => {
    await setNudges(alice.api, true);
    const task = await createTask(alice.api, {
      title: "Call Sam",
      dueDate: todayIso(),
      dueTime: "16:00",
    });
    const device = await registerDevice(alice.api);

    const result = await tickAt(alice.api, parisAt("14:00"));
    expect(result.status).toBe(200);

    await expect.poll(() => delivered(device).length).toBe(1);
    const [text] = delivered(device);
    expect(text).toContain("Call Sam");
    expect(text).toMatch(/due at/i);
    expect(text).not.toMatch(GUILT_WORDS);
    expect(task.id).toBeTruthy();
  });

  test("quiet hours: no nudge at night", async ({ alice }) => {
    await setNudges(alice.api, true);
    await createTask(alice.api, { title: "Late call", dueDate: todayIso(), dueTime: "23:30" });
    const device = await registerDevice(alice.api);

    await tickAt(alice.api, parisAt("23:00"));
    expect(delivered(device)).toHaveLength(0);
  });

  test("a task that was just nudged is not nudged again within three days", async ({ alice }) => {
    await setNudges(alice.api, true);
    await createTask(alice.api, { title: "Pay the rent", dueDate: todayIso(), dueTime: "16:00" });
    const device = await registerDevice(alice.api);

    await tickAt(alice.api, parisAt("14:00"));
    await expect.poll(() => delivered(device).length).toBe(1);
    await tickAt(alice.api, parisAt("14:30"));
    await tickAt(alice.api, parisAt("15:00"));
    expect(delivered(device)).toHaveLength(1);
  });

  test("at most three nudges a day", async ({ alice }) => {
    await setNudges(alice.api, true);
    for (const title of ["Task A", "Task B", "Task C", "Task D"]) {
      await createTask(alice.api, { title, dueDate: todayIso(), dueTime: "16:00" });
    }
    const device = await registerDevice(alice.api);

    for (const time of ["14:00", "14:30", "15:00", "15:30", "15:00"]) {
      await tickAt(alice.api, parisAt(time));
    }
    await expect.poll(() => delivered(device).length).toBe(3);
    expect(delivered(device)).toHaveLength(3);
  });

  test("a muted task is never nudged", async ({ alice }) => {
    await setNudges(alice.api, true);
    const task = await createTask(alice.api, {
      title: "Muted one",
      dueDate: todayIso(),
      dueTime: "16:00",
    });
    await ok(alice.api, "PUT", `/api/nudges/tasks/${task.id}`, { muted: true });
    const device = await registerDevice(alice.api);

    await tickAt(alice.api, parisAt("14:00"));
    expect(delivered(device)).toHaveLength(0);

    await ok(alice.api, "PUT", `/api/nudges/tasks/${task.id}`, { muted: false });
    await tickAt(alice.api, parisAt("14:30"));
    await expect.poll(() => delivered(device).length).toBe(1);
  });

  test("a snoozed task is not nudged until the snooze ends", async ({ alice }) => {
    await setNudges(alice.api, true);
    const task = await createTask(alice.api, {
      title: "Snoozed one",
      dueDate: todayIso(),
      dueTime: "16:00",
    });
    await ok(alice.api, "PUT", `/api/nudges/tasks/${task.id}`, { snoozed: true });
    const control = await ok<{ snoozedUntil: string | null }>(
      alice.api,
      "GET",
      `/api/nudges/tasks/${task.id}`,
    );
    expect(control.snoozedUntil).not.toBeNull();

    const device = await registerDevice(alice.api);
    await tickAt(alice.api, parisAt("14:00"));
    expect(delivered(device)).toHaveLength(0);
  });

  test("a device that answers 'gone' is removed, and a failed send does not use up the day", async ({
    alice,
  }) => {
    await setNudges(alice.api, true);
    await createTask(alice.api, {
      title: "Gone device check",
      dueDate: todayIso(),
      dueTime: "16:00",
    });
    const gone = await registerDevice(alice.api, "gone");
    await tickAt(alice.api, parisAt("14:00"));

    const devices = await ok<{ devices: Array<{ id: string }> }>(
      alice.api,
      "GET",
      "/api/nudges/devices",
    );
    expect(devices.devices.map((item) => item.id)).not.toContain(gone.id);
  });

  test("the tick refuses a request without the secret", async ({ alice }) => {
    const response = await call(
      alice.api,
      "POST",
      `/api/nudges/tick?asOf=${encodeURIComponent(parisAt("14:00"))}`,
    );
    expect(response.status).toBe(401);
  });

  test("the test-only clock refuses a malformed time", async ({ alice }) => {
    const response = await call(alice.api, "POST", "/api/nudges/tick?asOf=not-a-time", undefined, {
      "x-flowzone-tick-secret": TICK_SECRET,
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: "validation_failed" } });
  });

  test("known defect D-01: the scheduler's call without a session is accepted by the tick endpoint", async ({
    baseURL,
  }) => {
    test.fail(
      true,
      "Known defect D-01: src/proxy.ts refuses /api/nudges/tick without a session cookie.",
    );
    const anonymous = await request.newContext({ baseURL: baseURL ?? BASE_URL });
    const response = await anonymous.post(
      `/api/nudges/tick?asOf=${encodeURIComponent(parisAt("14:00"))}`,
      {
        headers: { "x-flowzone-tick-secret": TICK_SECRET },
      },
    );
    await anonymous.dispose();
    expect(response.status()).toBe(200);
  });
});
