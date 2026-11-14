import { createServiceContext } from "@/services/context";
import { dropTask } from "@/services/tasks";
import { uuidParam } from "@/server/http/params";
import { noContent, userRoute } from "@/server/http/route";

/** POST /api/tasks/:id/drop: let go of a task (and its subtasks). They disappear from every list. */
export const POST = userRoute<{ id: string }>(async ({ user, params }) => {
  const ctx = await createServiceContext(user);
  await dropTask(ctx, uuidParam(params.id));
  return noContent();
});
