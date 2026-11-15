import "server-only";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { nudgeLog, nudgeTaskControls, pushSubscriptions } from "@/server/db/schema";
import type { PushPayload } from "@/server/push/web-push";
import {
  NUDGE_CHECK_IN_GAP_HOURS,
  NUDGE_DAILY_CAP,
  NUDGE_NOTIFICATION_TITLE,
  NUDGE_TASK_GAP_HOURS,
  NUDGE_WORDING_TIMEOUT_MS,
} from "@/shared/nudge-tuning";
import type { NudgeKind } from "@/shared/nudges";
import { generateNudgeWording } from "../ai/features";
import { type ServiceContext } from "../context";
import { type InsertOf, patchFor } from "../db-types";
import { consentSwitches, getSettings } from "../settings";
import { deliverToDevices } from "./delivery";
import { nudgeCandidates } from "./candidates";
import {
  type GateState,
  type NudgeCandidate,
  type SkipReason,
  dailyCapReached,
  gapWindowStart,
  isQuietAt,
  localClock,
  pickNudge,
} from "./policy";
import { templateNudge } from "./copy";

/**
 * THE nudge engine for one person and one tick window. Contract: docs/contracts/nudges.md,
 * section 3. The order of the rules is the order of the checks below:
 *
 *   1. consent: the `nudges` switch is on (otherwise nothing at all happens);
 *   2. quiet hours, in the person's time zone;
 *   3. at least one device accepts notifications;
 *   4. the daily cap (every nudge type counts);
 *   5. candidates from the service layer, then the per-task gap, the check-in gap, mutes and
 *      snoozes, choosing the single best one;
 *   6. the window is reserved (a repeated call in the same window finds it and stops), the cap is
 *      counted again, the wording is chosen, and the nudge is sent and logged.
 *
 * Nudges never change data: this file writes only to the nudge tables and the device list.
 */

export type NudgeDecision =
  { status: "sent"; kind: NudgeKind; taskId: string } | { status: "skipped"; reason: SkipReason };

const HOUR_MS = 60 * 60 * 1000;

const skip = (reason: SkipReason): NudgeDecision => ({ status: "skipped", reason });

/**
 * Decides, and sends at most one nudge, for one person in one window. `window` is the ISO start
 * of the tick window (see policy.ts tickWindowFor). `ctx.now` must already be the window's instant.
 */
export async function decideAndSend(ctx: ServiceContext, window: string): Promise<NudgeDecision> {
  // 1. Consent. Off means nothing is read for nudges and nothing is sent.
  const switches = await consentSwitches(ctx);
  if (!switches.nudges) return skip("nudges_off");

  // 2. Quiet hours, in the person's own time zone.
  const settings = await getSettings(ctx);
  const clock = localClock(ctx.now, ctx.timeZone);
  if (isQuietAt(clock.time, settings.quietHours.start, settings.quietHours.end)) {
    return skip("quiet_hours");
  }

  // 3. A device to send to.
  const devices = await ctx.scope.list(pushSubscriptions, { limit: 50 });
  if (devices.length === 0) return skip("no_device");

  // 4. The daily cap, and the recent history the gaps need.
  const recent = await ctx.scope.list(nudgeLog, {
    where: and(
      gte(nudgeLog.decidedAt, gapWindowStart(ctx.now)),
      inArray(nudgeLog.outcome, ["pending", "sent"]),
    ),
    orderBy: [desc(nudgeLog.decidedAt)],
    limit: 200,
  });
  const sentToday = recent.filter((row) => row.localDay === ctx.today).length;
  if (dailyCapReached(sentToday)) return skip("daily_cap");

  // 5. Candidates, then the gates.
  const controls = await ctx.scope.list(nudgeTaskControls, { limit: 500 });
  const now = ctx.now.getTime();
  const gate: GateState = {
    recentTaskIds: new Set(
      recent
        .filter((row) => now - row.decidedAt.getTime() < NUDGE_TASK_GAP_HOURS * HOUR_MS)
        .map((row) => row.taskId)
        .filter((id): id is string => id !== null),
    ),
    mutedTaskIds: new Set(controls.filter((row) => row.muted).map((row) => row.taskId)),
    snoozedTaskIds: new Set(
      controls
        .filter((row) => row.snoozedUntil !== null && row.snoozedUntil.getTime() > now)
        .map((row) => row.taskId),
    ),
    checkInRecent: recent.some(
      (row) =>
        row.kind === "check_in" &&
        now - row.decidedAt.getTime() < NUDGE_CHECK_IN_GAP_HOURS * HOUR_MS,
    ),
  };

  const picked = pickNudge(await nudgeCandidates(ctx), gate);
  if (picked.candidate === null) return skip(picked.reason);
  const candidate = picked.candidate;

  // 6. Reserve the window. The client request id is the window, so a second call for the same
  //    window gets the existing row back (created: false) and sends nothing.
  const reserved = {
    kind: candidate.kind,
    taskId: candidate.taskId,
    reasonCode: candidate.reasonCode,
    text: templateNudge(candidate),
    wording: "template",
    outcome: "pending",
    localDay: ctx.today,
    decidedAt: ctx.now,
    sentAt: null,
  } satisfies InsertOf<typeof nudgeLog>;
  const reservation = await ctx.scope.create(nudgeLog, reserved, {
    clientRequestId: `tick-${window}`,
  });
  if (!reservation.created) return skip("already_handled");
  const row = reservation.row;

  // A parallel run may have reserved since the count above. The count includes this row,
  // so anything above the cap means this one must not go out.
  const countedNow = await ctx.scope.count(
    nudgeLog,
    and(eq(nudgeLog.localDay, ctx.today), inArray(nudgeLog.outcome, ["pending", "sent"])),
  );
  if (countedNow > NUDGE_DAILY_CAP) {
    await ctx.scope.updateById(
      nudgeLog,
      row.id,
      patchFor<typeof nudgeLog>({ outcome: "cancelled" }),
    );
    return skip("daily_cap");
  }

  const wording = await nudgeText(ctx, candidate, switches.ai_features);
  await ctx.scope.updateById(
    nudgeLog,
    row.id,
    patchFor<typeof nudgeLog>({ text: wording.text, wording: wording.source }),
  );

  const payload: PushPayload = {
    kind: "nudge",
    title: NUDGE_NOTIFICATION_TITLE,
    body: wording.text,
    url: `/tasks/${candidate.taskId}`,
    taskId: candidate.taskId,
    tag: `nudge-${candidate.taskId}`,
  };
  const count = await deliverToDevices(ctx, devices, payload);
  const delivered = count.delivered > 0;

  await ctx.scope.updateById(
    nudgeLog,
    row.id,
    patchFor<typeof nudgeLog>({
      outcome: delivered ? "sent" : "failed",
      sentAt: delivered ? new Date() : null,
    }),
  );

  if (delivered) return { status: "sent", kind: candidate.kind, taskId: candidate.taskId };
  return skip(count.gone === devices.length ? "no_device" : "error");
}

/**
 * The wording: AI when the person allows AI features and the AI answers in time and within the
 * rules; otherwise the fixed template. Never blocks the nudge. Only the task title and the reason
 * are sent to the AI (see ai.md, "Nudges use"), never notes.
 */
async function nudgeText(
  ctx: ServiceContext,
  candidate: NudgeCandidate,
  aiFeatures: boolean,
): Promise<{ text: string; source: "ai" | "template" }> {
  const template = { text: templateNudge(candidate), source: "template" as const };
  if (!aiFeatures) return template;
  try {
    const result = await withTimeout(
      generateNudgeWording(ctx, { taskId: candidate.taskId, reason: candidate.reason }),
      NUDGE_WORDING_TIMEOUT_MS,
    );
    if (result !== null && result.source === "ai") return { text: result.text, source: "ai" };
  } catch {
    // The AI is optional. Any failure falls back to the template below.
  }
  return template;
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
