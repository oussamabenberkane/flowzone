import { inboxQuery } from "@/shared/api-schemas";
import { createServiceContext } from "@/services/context";
import { listTasks } from "@/services/tasks";
import { ok, readQuery, userRoute } from "@/server/http/route";

/** GET /api/inbox: open top-level tasks that have no project, in manual order. */
export const GET = userRoute(async ({ req, user }) => {
  const query = readQuery(req, inboxQuery);
  const ctx = await createServiceContext(user);
  return ok(await listTasks(ctx, { ...query, projectId: "none", status: "open" }));
});
