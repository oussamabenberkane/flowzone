import { setTaskControlBody } from "@/shared/nudges";
import { createServiceContext } from "@/services/context";
import { getTaskControl, setTaskControl } from "@/services/nudges/controls";
import { uuidParam } from "@/server/http/params";
import { ok, readJson, userRoute } from "@/server/http/route";

/**
 * GET /api/nudges/tasks/:id: whether nudges about this task are muted or snoozed.
 * PUT /api/nudges/tasks/:id: change that. `{ muted: true }` mutes, `{ snoozed: true }` snoozes for
 * a few days. Changing these never changes the task itself.
 */
export const GET = userRoute<{ id: string }>(async ({ user, params }) => {
  const ctx = await createServiceContext(user);
  return ok(await getTaskControl(ctx, uuidParam(params.id)));
});

export const PUT = userRoute<{ id: string }>(async ({ req, user, params }) => {
  const body = await readJson(req, setTaskControlBody);
  const ctx = await createServiceContext(user);
  return ok(await setTaskControl(ctx, uuidParam(params.id), body));
});
