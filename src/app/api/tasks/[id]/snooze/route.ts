import { snoozeBody } from "@/shared/api-schemas";
import { createServiceContext } from "@/services/context";
import { snoozeTask } from "@/services/tasks";
import { readOptionalJson, uuidParam } from "@/server/http/params";
import { ok, userRoute } from "@/server/http/route";

/** POST /api/tasks/:id/snooze: hide from suggestions and fresh-look until a later day. */
export const POST = userRoute<{ id: string }>(async ({ req, user, params }) => {
  const body = await readOptionalJson(req, snoozeBody);
  const ctx = await createServiceContext(user);
  return ok(await snoozeTask(ctx, uuidParam(params.id), body.until));
});
