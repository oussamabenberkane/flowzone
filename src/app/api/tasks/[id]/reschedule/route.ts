import { rescheduleBody } from "@/shared/api-schemas";
import { createServiceContext } from "@/services/context";
import { rescheduleTask } from "@/services/tasks";
import { uuidParam } from "@/server/http/params";
import { ok, readJson, userRoute } from "@/server/http/route";

/** POST /api/tasks/:id/reschedule: give a one-off task a new date (null clears it). */
export const POST = userRoute<{ id: string }>(async ({ req, user, params }) => {
  const body = await readJson(req, rescheduleBody);
  const ctx = await createServiceContext(user);
  return ok(await rescheduleTask(ctx, uuidParam(params.id), body));
});
