import { updateProjectSchema } from "@/shared/api-schemas";
import { createServiceContext } from "@/services/context";
import { deleteProject, getProject, updateProject } from "@/services/projects";
import { uuidParam } from "@/server/http/params";
import { noContent, ok, readJson, userRoute } from "@/server/http/route";

export const GET = userRoute<{ id: string }>(async ({ user, params }) => {
  const ctx = await createServiceContext(user);
  return ok(await getProject(ctx, uuidParam(params.id)));
});

export const PATCH = userRoute<{ id: string }>(async ({ req, user, params }) => {
  const body = await readJson(req, updateProjectSchema);
  const ctx = await createServiceContext(user);
  return ok(await updateProject(ctx, uuidParam(params.id), body));
});

/** Deleting a project keeps its tasks and entries; they lose the project link. */
export const DELETE = userRoute<{ id: string }>(async ({ user, params }) => {
  const ctx = await createServiceContext(user);
  await deleteProject(ctx, uuidParam(params.id));
  return noContent();
});
