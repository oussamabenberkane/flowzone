import { planBody } from "@/shared/api-schemas";
import { createServiceContext } from "@/services/context";
import { getPlan, putPlan } from "@/services/today";
import { dateParam } from "@/server/http/params";
import { ok, readJson, userRoute } from "@/server/http/route";

/** GET /api/plans/:date: the plan for a day (YYYY-MM-DD). Empty when none was made. */
export const GET = userRoute<{ date: string }>(async ({ user, params }) => {
  const ctx = await createServiceContext(user);
  return ok(await getPlan(ctx, dateParam(params.date)));
});

/**
 * PUT /api/plans/:date: replace the whole plan for a day, in order. Send `confirmed: true`
 * to confirm it. Editing is always allowed.
 */
export const PUT = userRoute<{ date: string }>(async ({ req, user, params }) => {
  const body = await readJson(req, planBody);
  const ctx = await createServiceContext(user);
  return ok(await putPlan(ctx, dateParam(params.date), body));
});
