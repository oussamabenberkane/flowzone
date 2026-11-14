import { createProjectSchema } from "@/shared/api-schemas";
import { createServiceContext } from "@/services/context";
import { createProject, listProjects } from "@/services/projects";
import { createdJson, ok, readJson, userRoute } from "@/server/http/route";

/** GET /api/projects: all of the person's projects, in their order. */
export const GET = userRoute(async ({ user }) => {
  const ctx = await createServiceContext(user);
  return ok({ projects: await listProjects(ctx) });
});

/** POST /api/projects: create a project. Retries with the same clientRequestId return the first one. */
export const POST = userRoute(async ({ req, user }) => {
  const body = await readJson(req, createProjectSchema);
  const ctx = await createServiceContext(user);
  const { project, created } = await createProject(ctx, body);
  return created ? createdJson(project) : ok(project);
});
