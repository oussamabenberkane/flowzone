import "server-only";
import webpush, { WebPushError } from "web-push";
import { env } from "@/server/env";
import { logWarn } from "@/server/log";
import { NUDGE_PUSH_TTL_SECONDS } from "@/shared/nudge-tuning";

/**
 * Standard web push (RFC 8030 / RFC 8291 / VAPID) with keys this app made itself. The message
 * is encrypted for the browser before it leaves the server, so the push service (run by the
 * browser vendor) cannot read it. No third-party push service is involved.
 *
 * Owned by the Nudges agent. Contract: docs/contracts/nudges.md, section 6.
 */

/** What the service worker receives. Keep it short and never log it. */
export interface PushPayload {
  kind: "nudge" | "test";
  title: string;
  body: string;
  /** Where a tap goes: a task page or Today. Relative paths only. */
  url: string;
  taskId: string | null;
  /** Groups notifications for the same task, so a newer one replaces an older one. */
  tag: string;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  authSecret: string;
}

/**
 * - "delivered": the push service accepted the message.
 * - "gone": the browser no longer has this subscription (404 or 410). Remove the device.
 * - "failed": anything else (network, rate limit, server error). Try again on a later nudge.
 */
export type PushOutcome = "delivered" | "gone" | "failed";

let vapidFor: string | null = null;

/** True when all three web push keys are configured. */
export function pushConfigured(): boolean {
  return env.vapid !== null;
}

/** The public key the browser needs to subscribe. Null when push is not configured. */
export function publicVapidKey(): string | null {
  return env.vapid?.publicKey ?? null;
}

function ensureVapid(): boolean {
  const vapid = env.vapid;
  if (!vapid) return false;
  if (vapidFor !== vapid.publicKey) {
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    vapidFor = vapid.publicKey;
  }
  return true;
}

export async function sendPush(target: PushTarget, payload: PushPayload): Promise<PushOutcome> {
  if (!ensureVapid()) return "failed";
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.authSecret } },
      JSON.stringify(payload),
      { TTL: NUDGE_PUSH_TTL_SECONDS, urgency: "normal" },
    );
    return "delivered";
  } catch (error) {
    if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
      return "gone";
    }
    // Only the event name is logged. Never the endpoint, the keys or the message.
    logWarn("nudges.push_send_failed");
    return "failed";
  }
}
