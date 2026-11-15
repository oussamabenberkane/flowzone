import "server-only";
import { createHash } from "node:crypto";
import type { Row } from "@/server/db/scoped";
import { pushSubscriptions } from "@/server/db/schema";
import { type PushPayload, sendPush } from "@/server/push/web-push";
import { NUDGE_DEVICE_MAX_FAILURES } from "@/shared/nudge-tuning";
import type { ServiceContext } from "../context";
import { patchFor } from "../db-types";

/**
 * Sends one payload to each of a person's devices and keeps the device list honest:
 * a delivered push refreshes the device, a "gone" answer removes it at once, and repeated
 * failures remove it. Contract: docs/contracts/nudges.md, sections 6 and 8.
 */

export interface DeliveryCount {
  delivered: number;
  failed: number;
  gone: number;
}

/** SHA-256 of the push endpoint, in hex. The browser computes the same value for itself. */
export function endpointHash(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

export async function deliverToDevices(
  ctx: ServiceContext,
  devices: readonly Row<typeof pushSubscriptions>[],
  payload: PushPayload,
): Promise<DeliveryCount> {
  const count: DeliveryCount = { delivered: 0, failed: 0, gone: 0 };
  for (const device of devices) {
    const outcome = await sendPush(
      { endpoint: device.endpoint, p256dh: device.p256dh, authSecret: device.authSecret },
      payload,
    );
    if (outcome === "delivered") {
      count.delivered += 1;
      await ctx.scope.updateById(
        pushSubscriptions,
        device.id,
        patchFor<typeof pushSubscriptions>({ lastSuccessAt: new Date(), failureCount: 0 }),
      );
    } else if (outcome === "gone") {
      count.gone += 1;
      await ctx.scope.removeById(pushSubscriptions, device.id);
    } else {
      count.failed += 1;
      const failures = device.failureCount + 1;
      if (failures >= NUDGE_DEVICE_MAX_FAILURES) {
        await ctx.scope.removeById(pushSubscriptions, device.id);
      } else {
        await ctx.scope.updateById(
          pushSubscriptions,
          device.id,
          patchFor<typeof pushSubscriptions>({ failureCount: failures }),
        );
      }
    }
  }
  return count;
}
