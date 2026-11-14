import { quickAddBody } from "@/shared/api-schemas";
import { createServiceContext } from "@/services/context";
import { quickAdd } from "@/services/tasks";
import { ok, readJson, userRoute } from "@/server/http/route";

/**
 * POST /api/quick-add/parse: reads a line of plain text and returns what it understood
 * (title, date, time, project, priority). It creates nothing: the interface shows the result
 * and then calls POST /api/tasks. Works without AI.
 */
export const POST = userRoute(async ({ req, user }) => {
  const body = await readJson(req, quickAddBody);
  const ctx = await createServiceContext(user);
  return ok(await quickAdd(ctx, body.text));
});
