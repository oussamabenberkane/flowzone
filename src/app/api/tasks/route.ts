import { createTaskSchema, listTasksQuery } from "@/shared/api-schemas";
import { createServiceContext } from "@/services/context";
import { createTask, listTasks } from "@/services/tasks";
import { createdJson, ok, readJson, readQuery, userRoute } from "@/server/http/route";

/**
 * GET /api/tasks: the person's tasks. Defaults to top-level open tasks.
 * ?projectId=none is the Inbox; ?parentTaskId=… lists subtasks.
 */
export const GET = userRoute(async ({ req, user }) => {
  const query = readQuery(req, listTasksQuery);
  const ctx = await createServiceContext(user);
  return ok(await listTasks(ctx, query));
});

/** POST /api/tasks: create a task. A retry with the same clientRequestId returns the first task. */
export const POST = userRoute(async ({ req, user }) => {
  const body = await readJson(req, createTaskSchema);
  const ctx = await createServiceContext(user);
  const { task, created } = await createTask(ctx, body);
  return created ? createdJson(task) : ok(task);
});
