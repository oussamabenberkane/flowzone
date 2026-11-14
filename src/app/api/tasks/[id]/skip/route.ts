import { occurrenceBody } from "@/shared/api-schemas";
import { createServiceContext } from "@/services/context";
import { skipOccurrence } from "@/services/tasks";
import { readOptionalJson, uuidParam } from "@/server/http/params";
import { ok, userRoute } from "@/server/http/route";

/**
 * POST /api/tasks/:id/skip. Records the occurrence named in `occurrenceDate` as skipped on
 * purpose. Missed occurrences need no call: they are skipped silently.
 */
export const POST = userRoute<{ id: string }>(async ({ req, user, params }) => {
  const body = await readOptionalJson(req, occurrenceBody);
  const ctx = await createServiceContext(user);
  return ok(await skipOccurrence(ctx, uuidParam(params.id), body));
});
