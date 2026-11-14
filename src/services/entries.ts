import "server-only";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { z } from "zod";
import type { createEntrySchema, listEntriesQuery, updateEntrySchema } from "@/shared/api-schemas";
import { notFound, validationFailed } from "@/server/http/errors";
import { entries, projects, tasks } from "@/server/db/schema";
import type { EntryView } from "@/shared/views";
import type { ServiceContext } from "./context";
import { entryView } from "./views";
import type { InsertOf } from "./db-types";

/**
 * Notes and journal entries: one concept. An entry can link to a task, to a project,
 * both, or neither (a journal entry with a date). Its text is never logged.
 */

export type CreateEntryInput = z.infer<typeof createEntrySchema>;
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;
export type ListEntriesInput = z.output<typeof listEntriesQuery>;

function fieldError(field: string, message: string) {
  return validationFailed([{ field, message }]);
}

/** Links must point at the person's own, visible items. Anything else looks like "not found". */
async function ensureLinks(
  ctx: ServiceContext,
  links: { taskId?: string | null; projectId?: string | null },
): Promise<void> {
  if (links.taskId) {
    const task = await ctx.scope.findById(tasks, links.taskId);
    if (!task || task.droppedAt !== null) {
      throw fieldError("taskId", "That task could not be found.");
    }
  }
  if (links.projectId) {
    const project = await ctx.scope.findById(projects, links.projectId);
    if (!project) throw fieldError("projectId", "That project could not be found.");
  }
}

function hasText(title: string | null | undefined, body: string | undefined): boolean {
  return (title ?? "").trim() !== "" || (body ?? "").trim() !== "";
}

export async function createEntry(
  ctx: ServiceContext,
  input: CreateEntryInput,
): Promise<{ entry: EntryView; created: boolean }> {
  if (!hasText(input.title, input.body)) {
    throw fieldError("body", "Write a title or some text for this entry.");
  }
  await ensureLinks(ctx, { taskId: input.taskId, projectId: input.projectId });
  const values = {
    kind: input.kind,
    title: input.title?.trim() || null,
    body: input.body ?? "",
    entryDate: input.entryDate ?? ctx.today,
    taskId: input.taskId ?? null,
    projectId: input.projectId ?? null,
  } satisfies InsertOf<typeof entries>;
  const { row, created } = await ctx.scope.create(entries, values, {
    clientRequestId: input.clientRequestId,
  });
  return { entry: entryView(row), created };
}

export async function listEntries(
  ctx: ServiceContext,
  query: ListEntriesInput,
): Promise<{ entries: EntryView[]; limit: number; offset: number; hasMore: boolean }> {
  const conditions = [];
  if (query.kind) conditions.push(eq(entries.kind, query.kind));
  if (query.taskId) conditions.push(eq(entries.taskId, query.taskId));
  if (query.projectId) conditions.push(eq(entries.projectId, query.projectId));
  if (query.from) conditions.push(gte(entries.entryDate, query.from));
  if (query.to) conditions.push(lte(entries.entryDate, query.to));

  const rows = await ctx.scope.list(entries, {
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: [desc(entries.entryDate), desc(entries.createdAt)],
    limit: query.limit + 1,
    offset: query.offset,
  });
  return {
    entries: rows.slice(0, query.limit).map(entryView),
    limit: query.limit,
    offset: query.offset,
    hasMore: rows.length > query.limit,
  };
}

export async function getEntry(ctx: ServiceContext, id: string): Promise<EntryView> {
  const row = await ctx.scope.findById(entries, id);
  if (!row) throw notFound();
  return entryView(row);
}

export async function updateEntry(
  ctx: ServiceContext,
  id: string,
  patch: UpdateEntryInput,
): Promise<EntryView> {
  const current = await ctx.scope.findById(entries, id);
  if (!current) throw notFound();
  await ensureLinks(ctx, { taskId: patch.taskId, projectId: patch.projectId });

  const nextTitle = patch.title !== undefined ? patch.title : current.title;
  const nextBody = patch.body !== undefined ? patch.body : current.body;
  if (!hasText(nextTitle, nextBody)) {
    throw fieldError("body", "An entry needs a title or some text.");
  }

  const values: Partial<typeof entries.$inferInsert> = {};
  if (patch.kind !== undefined) values.kind = patch.kind;
  if (patch.title !== undefined) values.title = patch.title?.trim() || null;
  if (patch.body !== undefined) values.body = patch.body;
  if (patch.entryDate !== undefined) values.entryDate = patch.entryDate;
  if (patch.taskId !== undefined) values.taskId = patch.taskId;
  if (patch.projectId !== undefined) values.projectId = patch.projectId;

  const row = await ctx.scope.updateById(entries, id, values);
  if (!row) throw notFound();
  return entryView(row);
}

export async function deleteEntry(ctx: ServiceContext, id: string): Promise<void> {
  const removed = await ctx.scope.removeById(entries, id);
  if (!removed) throw notFound();
}
