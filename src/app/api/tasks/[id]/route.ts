import { updateTaskSchema } from "@/shared/api-schemas";
import { createServiceContext } from "@/services/context";
import { deleteTask, getTaskDetail, updateTask } from "@/services/tasks";
import { uuidParam } from "@/server/http/params";
import { noContent, ok, readJson, userRoute } from "@/server/http/route";

/** GET /api/tasks/:id: the task with its subtasks. */
export const GET = userRoute<{ id: string }>(async ({ user, params }) => {
  const ctx = await createServiceContext(user);
  return ok(await getTaskDetail(ctx, uuidParam(params.id)));
});

/**
 * PATCH /api/tasks/:id: change any editable field. Completion and skipping of repeating
 * tasks have their own endpoints; see docs/contracts/api.md.
 */
export const PATCH = userRoute<{ id: string }>(async ({ req, user, params }) => {
  const body = await readJson(req, updateTaskSchema);
  const ctx = await createServiceContext(user);
  return ok(await updateTask(ctx, uuidParam(params.id), body));
});

/** DELETE /api/tasks/:id: remove the task, its subtasks and their history. */
export const DELETE = userRoute<{ id: string }>(async ({ user, params }) => {
  const ctx = await createServiceContext(user);
  await deleteTask(ctx, uuidParam(params.id));
  return noContent();
});
