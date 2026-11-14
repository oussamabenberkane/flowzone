import { freshLookQuery } from "@/shared/api-schemas";
import { createServiceContext } from "@/services/context";
import { freshLook } from "@/services/today";
import { ok, readQuery, userRoute } from "@/server/http/route";

/**
 * GET /api/fresh-look: tasks that need a fresh look (date passed without completion, or
 * gone quiet). Each item says why, with reason "date_passed" or "stale". No day counts.
 */
export const GET = userRoute(async ({ req, user }) => {
  const query = readQuery(req, freshLookQuery);
  const ctx = await createServiceContext(user);
  return ok({ items: await freshLook(ctx, query.limit) });
});
