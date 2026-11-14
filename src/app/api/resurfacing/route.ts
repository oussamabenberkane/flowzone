import { resurfacingQuery } from "@/shared/api-schemas";
import { createServiceContext } from "@/services/context";
import { resurfacingCandidates } from "@/services/today";
import { ok, readQuery, userRoute } from "@/server/http/route";

/** GET /api/resurfacing: tasks that have gone quiet, longest-waiting first. */
export const GET = userRoute(async ({ req, user }) => {
  const query = readQuery(req, resurfacingQuery);
  const ctx = await createServiceContext(user);
  return ok({ tasks: await resurfacingCandidates(ctx, query.limit) });
});
