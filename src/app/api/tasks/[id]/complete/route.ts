import { occurrenceBody } from "@/shared/api-schemas";
import { createServiceContext } from "@/services/context";
import { completeTask } from "@/services/tasks";
import { readOptionalJson, uuidParam } from "@/server/http/params";
import { ok, userRoute } from "@/server/http/route";

/**
 * POST /api/tasks/:id/complete. A one-off task becomes completed. A repeating task records
 * the occurrence named in `occurrenceDate` as completed. Repeating: safe to retry.
 */
export const POST = userRoute<{ id: string }>(async ({ req, user, params }) => {
  const body = await readOptionalJson(req, occurrenceBody);
  const ctx = await createServiceContext(user);
  return ok(await completeTask(ctx, uuidParam(params.id), body));
});
