import "server-only";
import { listUserContexts } from "@/server/auth/system-context";
import { logError } from "@/server/log";
import { todayIn } from "@/shared/calendar";
import type { NudgeTickResultView } from "@/shared/nudges";
import { type ServiceContext, createServiceContext } from "../context";
import { decideAndSend } from "./engine";
import { tickWindowFor } from "./policy";

/**
 * One scheduler run: every allowed person is evaluated by the engine, one at a time. The result
 * holds counts only. No ids, titles or user content leave this function.
 *
 * `asOf` is only ever passed by the tick endpoint when the test-only clock is allowed (see
 * docs/contracts/nudges.md, section 2). Without it the run uses the real clock.
 */
export async function runNudgeTick(asOf: Date | null): Promise<NudgeTickResultView> {
  const now = asOf ?? new Date();
  const window = tickWindowFor(now);
  const result: NudgeTickResultView = { ok: true, window, evaluated: 0, sent: 0, skipped: {} };

  const users = await listUserContexts();
  for (const user of users) {
    result.evaluated += 1;
    try {
      const ctx = atInstant(await createServiceContext(user), now);
      const decision = await decideAndSend(ctx, window);
      if (decision.status === "sent") {
        result.sent += 1;
      } else {
        result.skipped[decision.reason] = (result.skipped[decision.reason] ?? 0) + 1;
      }
    } catch (error) {
      // One person's failure must not stop the others. Only the error type and code are logged.
      logError("nudges.tick_user_failed", error);
      result.skipped.error = (result.skipped.error ?? 0) + 1;
    }
  }
  return result;
}

/** The same context, but with the clock set to `now` (today and the instant both follow it). */
function atInstant(ctx: ServiceContext, now: Date): ServiceContext {
  return { ...ctx, now, today: todayIn(ctx.timeZone, now) };
}
