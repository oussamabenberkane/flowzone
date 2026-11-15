import { createServiceContext } from "@/services/context";
import { sendTestNotification } from "@/services/nudges/devices";
import { ok, userRoute } from "@/server/http/route";

/**
 * POST /api/nudges/test: a test notification to this person's devices, asked for in Settings.
 * It is not a nudge: it is not counted toward the daily cap and is not written to the nudge log.
 * It needs the `nudges` switch on. Answers only with counts.
 */
export const POST = userRoute(async ({ user }) => {
  const ctx = await createServiceContext(user);
  const count = await sendTestNotification(ctx);
  return ok(count);
});
