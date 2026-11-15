import "server-only";
import { notFound, conflict } from "@/server/http/errors";
import { pushSubscriptions } from "@/server/db/schema";
import { pushConfigured, publicVapidKey } from "@/server/push/web-push";
import type { AddDeviceInput, NudgeDeviceView, NudgeDevicesView } from "@/shared/nudges";
import type { ServiceContext } from "../context";
import { type InsertOf, patchFor } from "../db-types";
import { consentSwitches } from "../settings";
import { NUDGE_NOTIFICATION_TITLE } from "@/shared/nudge-tuning";
import { TEST_NUDGE_BODY } from "./copy";
import { type DeliveryCount, deliverToDevices, endpointHash } from "./delivery";
import type { Row } from "@/server/db/scoped";

/**
 * The devices (browsers) that accept notifications. Contract: docs/contracts/nudges.md, section 6.
 * Devices are the person's own data. The endpoint and keys are never returned to the browser.
 */

const TURN_ON_FIRST = "Turn on Nudges in Settings first.";
const NOT_SET_UP = "Notifications aren't set up on this server yet.";

function deviceView(row: Row<typeof pushSubscriptions>): NudgeDeviceView {
  return {
    id: row.id,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    endpointHash: endpointHash(row.endpoint),
  };
}

export async function listDevices(ctx: ServiceContext): Promise<NudgeDevicesView> {
  const rows = await ctx.scope.list(pushSubscriptions, {
    orderBy: [pushSubscriptions.createdAt],
    limit: 50,
  });
  return {
    configured: pushConfigured(),
    publicKey: publicVapidKey(),
    devices: rows.map(deviceView),
  };
}

/**
 * Registers this browser. The same endpoint again updates the existing device (for example after
 * the browser renewed its keys), so retries and re-subscriptions never duplicate a device.
 */
export async function addDevice(
  ctx: ServiceContext,
  input: AddDeviceInput,
): Promise<NudgeDeviceView> {
  if (!(await consentSwitches(ctx)).nudges) throw conflict(TURN_ON_FIRST);
  if (!pushConfigured()) throw conflict(NOT_SET_UP);

  const hash = endpointHash(input.endpoint);
  const values = {
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    authSecret: input.keys.auth,
    label: input.label,
    lastSuccessAt: null,
    failureCount: 0,
  } satisfies InsertOf<typeof pushSubscriptions>;
  const { row, created } = await ctx.scope.create(pushSubscriptions, values, {
    clientRequestId: `device-${hash}`,
  });
  if (created) return deviceView(row);

  const updated = await ctx.scope.updateById(
    pushSubscriptions,
    row.id,
    patchFor<typeof pushSubscriptions>({
      p256dh: input.keys.p256dh,
      authSecret: input.keys.auth,
      label: input.label,
      failureCount: 0,
    }),
  );
  return deviceView(updated ?? row);
}

export async function removeDevice(ctx: ServiceContext, id: string): Promise<void> {
  const removed = await ctx.scope.removeById(pushSubscriptions, id);
  if (!removed) throw notFound("That device is no longer set up.");
}

/** A test notification to every device. It says why it was sent. It is not a nudge and is not logged. */
export async function sendTestNotification(ctx: ServiceContext): Promise<DeliveryCount> {
  if (!(await consentSwitches(ctx)).nudges) throw conflict(TURN_ON_FIRST);
  if (!pushConfigured()) throw conflict(NOT_SET_UP);
  const devices = await ctx.scope.list(pushSubscriptions, { limit: 50 });
  if (devices.length === 0) throw conflict("No device is set up for notifications yet.");
  return deliverToDevices(ctx, devices, {
    kind: "test",
    title: NUDGE_NOTIFICATION_TITLE,
    body: TEST_NUDGE_BODY,
    url: "/settings",
    taskId: null,
    tag: "flowzone-test",
  });
}
