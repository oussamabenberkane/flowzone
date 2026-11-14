import { searchQuery } from "@/shared/api-schemas";
import { createServiceContext } from "@/services/context";
import { search } from "@/services/search";
import { ok, readQuery, userRoute } from "@/server/http/route";

/** GET /api/search?q=…: full-text search over task titles and notes/journal text. */
export const GET = userRoute(async ({ req, user }) => {
  const query = readQuery(req, searchQuery);
  const ctx = await createServiceContext(user);
  return ok(await search(ctx, query.q, query.limit));
});
