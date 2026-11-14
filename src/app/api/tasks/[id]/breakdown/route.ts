import { breakdownBody } from "@/shared/api-schemas";
import { createServiceContext } from "@/services/context";
import { breakDownTask } from "@/services/tasks";
import { uuidParam } from "@/server/http/params";
import { ok, readJson, userRoute } from "@/server/http/route";

/** POST /api/tasks/:id/breakdown: create subtasks (1–10 steps) under a main task. */
export const POST = userRoute<{ id: string }>(async ({ req, user, params }) => {
  const body = await readJson(req, breakdownBody);
  const ctx = await createServiceContext(user);
  return ok(await breakDownTask(ctx, uuidParam(params.id), body));
});
