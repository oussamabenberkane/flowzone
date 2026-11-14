import { createServiceContext } from "@/services/context";
import { getToday } from "@/services/today";
import { ok, userRoute } from "@/server/http/route";

/** GET /api/today: today's date (in the person's time zone) and today's plan. */
export const GET = userRoute(async ({ user }) => {
  const ctx = await createServiceContext(user);
  return ok(await getToday(ctx));
});
