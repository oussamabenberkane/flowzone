import "server-only";
import { desc } from "drizzle-orm";
import type { z } from "zod";
import type { createProjectSchema, updateProjectSchema } from "@/shared/api-schemas";
import { notFound } from "@/server/http/errors";
import { projects } from "@/server/db/schema";
import type { ProjectView } from "@/shared/views";
import type { ServiceContext } from "./context";
import { projectView } from "./views";
import type { InsertOf } from "./db-types";

/**
 * Projects are flat. Deleting a project keeps its tasks and entries: they move back to
 * the Inbox (tasks) or to "no project" (entries). The database clears the link.
 */

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export async function listProjects(ctx: ServiceContext): Promise<ProjectView[]> {
  const rows = await ctx.scope.list(projects, {
    orderBy: [projects.position, projects.name],
    limit: 200,
  });
  return rows.map(projectView);
}

export async function createProject(
  ctx: ServiceContext,
  input: CreateProjectInput,
): Promise<{ project: ProjectView; created: boolean }> {
  const [last] = await ctx.scope.list(projects, { orderBy: desc(projects.position), limit: 1 });
  const values = {
    name: input.name,
    position: last ? last.position + 1 : 0,
  } satisfies InsertOf<typeof projects>;
  const { row, created } = await ctx.scope.create(projects, values, {
    clientRequestId: input.clientRequestId,
  });
  return { project: projectView(row), created };
}

export async function getProject(ctx: ServiceContext, id: string): Promise<ProjectView> {
  const row = await ctx.scope.findById(projects, id);
  if (!row) throw notFound();
  return projectView(row);
}

export async function updateProject(
  ctx: ServiceContext,
  id: string,
  patch: UpdateProjectInput,
): Promise<ProjectView> {
  const row = await ctx.scope.updateById(projects, id, patch);
  if (!row) throw notFound();
  return projectView(row);
}

export async function deleteProject(ctx: ServiceContext, id: string): Promise<void> {
  const removed = await ctx.scope.removeById(projects, id);
  if (!removed) throw notFound();
}
