import "server-only";
import { type SQL, and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { z } from "zod";
import type {
  breakdownBody,
  createTaskSchema,
  listTasksQuery,
  occurrenceBody,
  rescheduleBody,
  updateTaskSchema,
} from "@/shared/api-schemas";
import { conflict, notFound, validationFailed } from "@/server/http/errors";
import { projects, recurrenceRecords, tasks } from "@/server/db/schema";
import { type InsertOf, patchFor } from "./db-types";
import { addDays, toDayNumber } from "@/shared/calendar";
import { normalizeRecurrenceRule } from "@/shared/recurrence";
import { SNOOZE_DEFAULT_DAYS } from "@/shared/tuning";
import type { QuickAddView, TaskDetailView, TaskPage, TaskView } from "@/shared/views";
import type { ServiceContext } from "./context";
import { parseQuickAdd } from "./rules/quick-add";
import { isOccurrence } from "./rules/recurrence";
import { type TaskRow, loadOutcomes, taskView, taskViews } from "./views";

/**
 * Tasks: creation, editing, completion, skipping, dropping, snoozing, rescheduling,
 * breaking down and listing. Every rule the interface relies on is enforced here, so the
 * API, the AI agent and the Nudges agent all behave the same.
 *
 * Rules (full list in docs/contracts/api.md, "Tasks"):
 *  - A subtask is one level below a top-level task. It has no project and does not repeat.
 *  - A recurring task has no fixed date of its own: its date is its current occurrence.
 *  - Completing or skipping a recurring task records one occurrence, never the whole task.
 *  - "Dropped" tasks are hidden from every list (dropping a task also drops its subtasks).
 *  - Every change counts as activity; snoozing does not.
 */

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ListTasksInput = z.output<typeof listTasksQuery>;
export type RescheduleInput = z.infer<typeof rescheduleBody>;
export type BreakdownInput = z.infer<typeof breakdownBody>;
export type OccurrenceInput = z.infer<typeof occurrenceBody>;

const OPEN_STATUSES = ["pending", "in_progress"] as const;

function fieldError(field: string, message: string) {
  return validationFailed([{ field, message }]);
}

/** Loads a task the person can see (not dropped). Anything else is "not found". */
export async function loadTask(ctx: ServiceContext, id: string): Promise<TaskRow> {
  const row = await ctx.scope.findById(tasks, id);
  if (!row || row.droppedAt !== null) throw notFound();
  return row;
}

async function ensureProject(ctx: ServiceContext, projectId: string): Promise<void> {
  const project = await ctx.scope.findById(projects, projectId);
  if (!project) throw fieldError("projectId", "That project could not be found.");
}

async function ensureParent(ctx: ServiceContext, parentId: string): Promise<TaskRow> {
  const parent = await ctx.scope.findById(tasks, parentId);
  if (!parent || parent.droppedAt !== null) {
    throw fieldError("parentTaskId", "That task could not be found.");
  }
  if (parent.parentTaskId !== null) {
    throw fieldError("parentTaskId", "Subtasks can only be one level deep.");
  }
  return parent;
}

/** Where a new task goes in its list: after the last sibling. */
async function nextPosition(
  ctx: ServiceContext,
  parentId: string | null,
  projectId: string | null,
): Promise<number> {
  const siblings =
    parentId !== null
      ? eq(tasks.parentTaskId, parentId)
      : and(
          isNull(tasks.parentTaskId),
          projectId !== null ? eq(tasks.projectId, projectId) : isNull(tasks.projectId),
        );
  const [last] = await ctx.scope.list(tasks, {
    where: siblings,
    orderBy: desc(tasks.position),
    limit: 1,
  });
  return last ? last.position + 1 : 0;
}

/** Recording an occurrence: complete or skip, for a recurring task. */
async function recordOccurrence(
  ctx: ServiceContext,
  row: TaskRow,
  outcome: "completed" | "skipped",
  requested: string | undefined,
): Promise<TaskView> {
  const rule = row.recurrenceRule;
  const startDate = row.recurrenceStart;
  if (!rule || !startDate) throw conflict("This task doesn't repeat.");
  if (row.recurrencePaused) {
    throw conflict("This repeating task is paused. Resume it to act on an occurrence.");
  }

  // The occurrence must be named. Acting on "whatever is current" would make a repeated
  // request (a double tap, an offline retry) complete the NEXT occurrence by mistake.
  if (requested === undefined) {
    throw fieldError("occurrenceDate", "Say which occurrence this is: send the date it shows.");
  }
  const startDay = toDayNumber(startDate);
  const day = toDayNumber(requested);
  if (!isOccurrence(rule, startDay, day)) {
    throw fieldError("occurrenceDate", "That date isn't an occurrence of this task.");
  }

  // Already recorded: the answer is the same as before. Acting twice is harmless.
  const outcomes = (await loadOutcomes(ctx, [row.id])).get(row.id) ?? new Map();
  if (outcomes.has(day)) return taskView(ctx, await loadTask(ctx, row.id));

  const occurrenceDate = requested;
  await ctx.scope.transaction(async (scope) => {
    await scope.create(
      recurrenceRecords,
      { taskId: row.id, occurrenceDate, outcome },
      // One key per (task, occurrence): a retry can never record the same day twice.
      { clientRequestId: `occ-${row.id}-${occurrenceDate}` },
    );
    const patch = patchFor<typeof tasks>({
      status: "pending",
      lastActivityAt: ctx.now,
    });
    await scope.updateById(tasks, row.id, patch);
  });
  return taskView(ctx, await loadTask(ctx, row.id));
}

export async function createTask(
  ctx: ServiceContext,
  input: CreateTaskInput,
): Promise<{ task: TaskView; created: boolean }> {
  const parent = input.parentTaskId ? await ensureParent(ctx, input.parentTaskId) : null;
  if (parent && input.projectId) {
    throw fieldError(
      "projectId",
      "A subtask belongs to its main task's project. Leave this empty.",
    );
  }
  if (parent && input.recurrence) {
    throw fieldError("recurrence", "A subtask can't repeat. Repeat the main task instead.");
  }
  const projectId = parent ? null : (input.projectId ?? null);
  if (projectId !== null) await ensureProject(ctx, projectId);

  const recurrence = input.recurrence ?? null;
  const dueDate = recurrence ? null : (input.dueDate ?? null);
  const dueTime = input.dueTime ?? null;
  if (dueTime !== null && dueDate === null && recurrence === null) {
    throw fieldError("dueTime", "Add a date before a time.");
  }

  const startDate = recurrence ? (recurrence.startDate ?? input.dueDate ?? ctx.today) : null;
  const position = await nextPosition(ctx, parent?.id ?? null, projectId);

  const values = {
    title: input.title,
    status: input.status ?? "pending",
    projectId,
    parentTaskId: parent?.id ?? null,
    dueDate,
    dueTime,
    priority: input.priority ?? "normal",
    energy: input.energy ?? null,
    estimateMinutes: input.estimateMinutes ?? null,
    recurrenceRule: recurrence ? normalizeRecurrenceRule(recurrence.rule) : null,
    recurrenceStart: startDate,
    recurrencePaused: recurrence?.paused ?? false,
    position,
    completedAt: null,
    snoozedUntil: null,
    droppedAt: null,
  } satisfies InsertOf<typeof tasks>;
  const { row, created } = await ctx.scope.create(tasks, values, {
    clientRequestId: input.clientRequestId,
  });
  return { task: await taskView(ctx, row), created };
}

export async function updateTask(
  ctx: ServiceContext,
  id: string,
  patch: UpdateTaskInput,
): Promise<TaskView> {
  const row = await loadTask(ctx, id);
  const isSubtask = row.parentTaskId !== null;
  const wasRecurring = row.recurrenceRule !== null;

  if (isSubtask && patch.projectId) {
    throw fieldError(
      "projectId",
      "A subtask belongs to its main task's project. Leave this empty.",
    );
  }
  if (isSubtask && patch.recurrence) {
    throw fieldError("recurrence", "A subtask can't repeat. Repeat the main task instead.");
  }
  if (patch.projectId) await ensureProject(ctx, patch.projectId);

  if (patch.status === "completed" && (wasRecurring || patch.recurrence)) {
    throw conflict("A repeating task is completed one occurrence at a time. Use complete instead.");
  }
  if (wasRecurring && patch.recurrence === undefined && patch.dueDate) {
    throw conflict("A repeating task follows its rule. Change the rule instead of its date.");
  }

  // Work out the final due date, recurrence and time, then check them together.
  const values: Partial<typeof tasks.$inferInsert> = {};
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.priority !== undefined) values.priority = patch.priority;
  if (patch.energy !== undefined) values.energy = patch.energy;
  if (patch.estimateMinutes !== undefined) values.estimateMinutes = patch.estimateMinutes;
  if (patch.projectId !== undefined) values.projectId = patch.projectId;
  if (patch.position !== undefined) values.position = patch.position;

  if (patch.status !== undefined) {
    values.status = patch.status;
    values.completedAt = patch.status === "completed" ? ctx.now : null;
  }

  // The due date. A repeating task never stores its own date (its occurrence is derived).
  let finalDueDate: string | null;
  if (patch.recurrence) {
    // Set or change the rule. The date given (if any) becomes the start of the rule.
    const base =
      patch.dueDate !== undefined
        ? patch.dueDate
        : wasRecurring
          ? row.recurrenceStart
          : row.dueDate;
    values.recurrenceRule = normalizeRecurrenceRule(patch.recurrence.rule);
    values.recurrenceStart = patch.recurrence.startDate ?? base ?? ctx.today;
    values.recurrencePaused =
      patch.recurrence.paused ?? (wasRecurring ? row.recurrencePaused : false);
    values.dueDate = null;
    finalDueDate = null;
  } else if (patch.recurrence === null) {
    // Remove the rule: the task becomes a one-off with the date given (or none).
    values.recurrenceRule = null;
    values.recurrenceStart = null;
    values.recurrencePaused = false;
    finalDueDate = patch.dueDate !== undefined ? patch.dueDate : null;
    values.dueDate = finalDueDate;
  } else if (wasRecurring) {
    finalDueDate = null;
  } else {
    if (patch.dueDate !== undefined) values.dueDate = patch.dueDate;
    finalDueDate = patch.dueDate !== undefined ? patch.dueDate : row.dueDate;
  }

  const finalRecurring = patch.recurrence !== undefined ? patch.recurrence !== null : wasRecurring;
  const finalTime = patch.dueTime !== undefined ? patch.dueTime : row.dueTime;
  if (patch.dueTime !== undefined) values.dueTime = patch.dueTime;
  if (finalTime && !finalRecurring && finalDueDate === null) {
    throw fieldError("dueTime", "Add a date before a time.");
  }

  values.lastActivityAt = ctx.now;
  const updated = await ctx.scope.updateById(tasks, id, values);
  if (!updated) throw notFound();
  return taskView(ctx, updated);
}

export async function completeTask(
  ctx: ServiceContext,
  id: string,
  input: OccurrenceInput,
): Promise<TaskView> {
  const row = await loadTask(ctx, id);
  if (row.recurrenceRule) {
    return recordOccurrence(ctx, row, "completed", input.occurrenceDate);
  }
  if (input.occurrenceDate !== undefined) {
    throw fieldError("occurrenceDate", "Only a repeating task has occurrences.");
  }
  if (row.status === "completed") return taskView(ctx, row);
  const patch = patchFor<typeof tasks>({
    status: "completed",
    completedAt: ctx.now,
    lastActivityAt: ctx.now,
  });
  const updated = await ctx.scope.updateById(tasks, id, patch);
  if (!updated) throw notFound();
  return taskView(ctx, updated);
}

export async function skipOccurrence(
  ctx: ServiceContext,
  id: string,
  input: OccurrenceInput,
): Promise<TaskView> {
  const row = await loadTask(ctx, id);
  if (!row.recurrenceRule) {
    throw conflict("Only a repeating task has occurrences to skip.");
  }
  return recordOccurrence(ctx, row, "skipped", input.occurrenceDate);
}

/** Drop: the task (and its subtasks) disappear from every list. Idempotent. */
export async function dropTask(ctx: ServiceContext, id: string): Promise<void> {
  const row = await ctx.scope.findById(tasks, id);
  if (!row) throw notFound();
  if (row.droppedAt !== null) return;
  const patch = patchFor<typeof tasks>({ droppedAt: ctx.now, lastActivityAt: ctx.now });
  await ctx.scope.update(tasks, or(eq(tasks.id, id), eq(tasks.parentTaskId, id)) as SQL, patch);
}

/** Snooze: hide from suggestions and fresh-look until a later day. Not an activity. */
export async function snoozeTask(
  ctx: ServiceContext,
  id: string,
  until?: string,
): Promise<TaskView> {
  await loadTask(ctx, id);
  const day = until ?? addDays(ctx.today, SNOOZE_DEFAULT_DAYS);
  if (day <= ctx.today) throw fieldError("until", "Pick a day after today.");
  if (toDayNumber(day) - toDayNumber(ctx.today) > 366) {
    throw fieldError("until", "Snooze for up to a year at a time.");
  }
  const patch = patchFor<typeof tasks>({ snoozedUntil: day });
  const updated = await ctx.scope.updateById(tasks, id, patch);
  if (!updated) throw notFound();
  return taskView(ctx, updated);
}

/** Reschedule a one-off task. A repeating task follows its rule, so it cannot be moved. */
export async function rescheduleTask(
  ctx: ServiceContext,
  id: string,
  input: RescheduleInput,
): Promise<TaskView> {
  const row = await loadTask(ctx, id);
  if (row.recurrenceRule) {
    throw conflict("A repeating task follows its rule. Change the rule instead of its date.");
  }
  const dueTime =
    input.dueTime !== undefined ? input.dueTime : input.dueDate === null ? null : row.dueTime;
  if (dueTime && input.dueDate === null) {
    throw fieldError("dueTime", "Add a date before a time.");
  }
  const patch = patchFor<typeof tasks>({
    dueDate: input.dueDate,
    dueTime,
    lastActivityAt: ctx.now,
  });
  const updated = await ctx.scope.updateById(tasks, id, patch);
  if (!updated) throw notFound();
  return taskView(ctx, updated);
}

/** Create subtasks for a top-level task. Each step may carry its own request id. */
export async function breakDownTask(
  ctx: ServiceContext,
  id: string,
  input: BreakdownInput,
): Promise<TaskDetailView> {
  const row = await loadTask(ctx, id);
  if (row.parentTaskId !== null) {
    throw conflict("Subtasks are already the small steps. Break down the main task instead.");
  }
  const firstPosition = await nextPosition(ctx, id, null);
  await ctx.scope.transaction(async (scope) => {
    for (const [index, step] of input.steps.entries()) {
      const values = {
        title: step.title,
        status: "pending",
        projectId: null,
        parentTaskId: id,
        dueDate: null,
        dueTime: null,
        priority: "normal",
        energy: null,
        estimateMinutes: null,
        recurrenceRule: null,
        recurrenceStart: null,
        recurrencePaused: false,
        position: firstPosition + index,
        completedAt: null,
        snoozedUntil: null,
        droppedAt: null,
      } satisfies InsertOf<typeof tasks>;
      await scope.create(tasks, values, { clientRequestId: step.clientRequestId });
    }
    const patch = patchFor<typeof tasks>({ lastActivityAt: ctx.now });
    await scope.updateById(tasks, id, patch);
  });
  return getTaskDetail(ctx, id);
}

export async function getTaskDetail(ctx: ServiceContext, id: string): Promise<TaskDetailView> {
  const row = await loadTask(ctx, id);
  const subtasks = await ctx.scope.list(tasks, {
    where: and(eq(tasks.parentTaskId, id), isNull(tasks.droppedAt)),
    orderBy: [asc(tasks.position), asc(tasks.createdAt)],
  });
  const [view, subtaskViews] = await Promise.all([taskView(ctx, row), taskViews(ctx, subtasks)]);
  return { ...view, subtasks: subtaskViews };
}

export async function deleteTask(ctx: ServiceContext, id: string): Promise<void> {
  const removed = await ctx.scope.removeById(tasks, id);
  if (!removed) throw notFound();
}

/**
 * Lists tasks. By default only top-level, open tasks; `projectId=none` is the Inbox.
 * Pages are fetched one row longer than requested to know whether there is more.
 */
/** Reads a line of plain text the way quick-add does. Creates nothing. */
export async function quickAdd(ctx: ServiceContext, text: string): Promise<QuickAddView> {
  const parsed = parseQuickAdd(text, ctx.today);
  let projectId: string | null = null;
  if (parsed.projectName !== null) {
    const wanted = parsed.projectName.toLowerCase();
    const all = await ctx.scope.list(projects, { limit: 200 });
    projectId = all.find((project) => project.name.toLowerCase() === wanted)?.id ?? null;
  }
  return { ...parsed, projectId };
}

export async function listTasks(ctx: ServiceContext, query: ListTasksInput): Promise<TaskPage> {
  const conditions: SQL[] = [isNull(tasks.droppedAt)];
  if (query.parentTaskId !== undefined) {
    conditions.push(eq(tasks.parentTaskId, query.parentTaskId));
  } else {
    conditions.push(isNull(tasks.parentTaskId));
    if (query.projectId === "none") conditions.push(isNull(tasks.projectId));
    else if (query.projectId !== undefined) conditions.push(eq(tasks.projectId, query.projectId));
  }
  if (query.status === "open") conditions.push(inArray(tasks.status, [...OPEN_STATUSES]));
  if (query.status === "completed") conditions.push(eq(tasks.status, "completed"));

  const rows = await ctx.scope.list(tasks, {
    where: and(...conditions),
    orderBy: [asc(tasks.position), asc(tasks.createdAt)],
    limit: query.limit + 1,
    offset: query.offset,
  });
  const page = rows.slice(0, query.limit);
  return {
    tasks: await taskViews(ctx, page),
    limit: query.limit,
    offset: query.offset,
    hasMore: rows.length > query.limit,
  };
}
