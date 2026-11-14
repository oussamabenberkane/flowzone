import "server-only";
import { inArray } from "drizzle-orm";
import { type entries, type projects, recurrenceRecords, type tasks } from "@/server/db/schema";
import { type DayNumber, fromDayNumber, toDayNumber, toTimeOfDay } from "@/shared/calendar";
import type {
  RecurrenceOutcome,
  EntryView,
  ProjectView,
  RecurrenceView,
  TaskView,
} from "@/shared/views";
import { resolveRecurrence } from "./rules/recurrence";
import type { ServiceContext } from "./context";

/**
 * Turns database rows into the JSON shapes the API returns (docs/contracts/api.md).
 * Recurring tasks are resolved here, once per response, with a single query for all
 * their records.
 */

export type TaskRow = typeof tasks.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type EntryRow = typeof entries.$inferSelect;
type RecordRow = typeof recurrenceRecords.$inferSelect;

export type OutcomeMap = Map<DayNumber, RecurrenceOutcome>;

export function projectView(row: ProjectRow): ProjectView {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function entryView(row: EntryRow): EntryView {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    entryDate: row.entryDate,
    taskId: row.taskId,
    projectId: row.projectId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Recorded outcomes for the given recurring tasks, grouped per task. */
export async function loadOutcomes(
  ctx: ServiceContext,
  taskIds: readonly string[],
): Promise<Map<string, OutcomeMap>> {
  const grouped = new Map<string, OutcomeMap>();
  if (taskIds.length === 0) return grouped;
  const rows: RecordRow[] = await ctx.scope.list(recurrenceRecords, {
    where: inArray(recurrenceRecords.taskId, [...taskIds]),
  });
  for (const row of rows) {
    const outcomes = grouped.get(row.taskId) ?? new Map<DayNumber, RecurrenceOutcome>();
    outcomes.set(toDayNumber(row.occurrenceDate), row.outcome);
    grouped.set(row.taskId, outcomes);
  }
  return grouped;
}

function recurrenceFor(
  ctx: ServiceContext,
  row: TaskRow,
  outcomes: OutcomeMap | undefined,
): RecurrenceView | null {
  if (!row.recurrenceRule || !row.recurrenceStart) return null;
  const state = resolveRecurrence({
    rule: row.recurrenceRule,
    startDay: toDayNumber(row.recurrenceStart),
    paused: row.recurrencePaused,
    today: toDayNumber(ctx.today),
    outcomes: outcomes ?? new Map(),
  });
  return {
    rule: row.recurrenceRule,
    startDate: row.recurrenceStart,
    paused: state.paused,
    currentOccurrence:
      state.currentOccurrence === null ? null : fromDayNumber(state.currentOccurrence),
    consecutiveSkips: state.consecutiveSkips,
    adjustSuggested: state.adjustSuggested,
  };
}

/** A task as the API returns it. For a recurring task, `dueDate` is the current occurrence. */
export async function taskViews(
  ctx: ServiceContext,
  rows: readonly TaskRow[],
): Promise<TaskView[]> {
  const recurringIds = rows.filter((row) => row.recurrenceRule !== null).map((row) => row.id);
  const outcomes = await loadOutcomes(ctx, recurringIds);
  return rows.map((row) => toTaskView(ctx, row, outcomes.get(row.id)));
}

export async function taskView(ctx: ServiceContext, row: TaskRow): Promise<TaskView> {
  const [view] = await taskViews(ctx, [row]);
  if (!view) throw new Error("taskView: no view produced for a task row");
  return view;
}

function toTaskView(ctx: ServiceContext, row: TaskRow, outcomes: OutcomeMap | undefined): TaskView {
  const recurrence = recurrenceFor(ctx, row, outcomes);
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    projectId: row.projectId,
    parentTaskId: row.parentTaskId,
    dueDate: recurrence ? recurrence.currentOccurrence : row.dueDate,
    dueTime: row.dueTime ? toTimeOfDay(row.dueTime) : null,
    priority: row.priority,
    energy: row.energy,
    estimateMinutes: row.estimateMinutes,
    recurrence,
    position: row.position,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    lastActivityAt: row.lastActivityAt.toISOString(),
    snoozedUntil: row.snoozedUntil,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
