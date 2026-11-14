import { suggestionsQuery } from "@/shared/api-schemas";
import { createServiceContext } from "@/services/context";
import { suggestionsFor } from "@/services/today";
import { ok, readQuery, userRoute } from "@/server/http/route";

/**
 * GET /api/today/suggestions?energy=low|medium|high: up to 5 tasks, ranked by the rules,
 * each with the reasons it was picked. Nothing changes until the person confirms a plan.
 */
export const GET = userRoute(async ({ req, user }) => {
  const query = readQuery(req, suggestionsQuery);
  const ctx = await createServiceContext(user);
  return ok(await suggestionsFor(ctx, query.energy));
});
