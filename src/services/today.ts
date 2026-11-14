import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { validationFailed } from "@/server/http/errors";
import { dayPlanItems, dayPlans, tasks } from "@/server/db/schema";
import { CANDIDATE_POOL_LIMIT } from "@/shared/tuning";
import { type InsertOf, patchFor } from "./db-types";
import type {
  DayPlanView,
  EnergyLevel,
  FreshLookItemView,
  SuggestionsView,
  TaskView,
  TodayView,
} from "@/shared/views";
import type { ServiceContext } from "./context";
import { freshLookReason, isStale, rankSuggestions } from "./rules/attention";
import { taskViews } from "./views";

/**
 * Today, the day plan, the rules-based suggestion, the fresh-look queue and resurfacing.
 * The rules live in ./rules/attention.ts; this file loads the candidates and applies them.
 *
 * Wording rule: nothing is called "overdue" or "late", and no field counts days late.
 */

/**
 * The open top-level tasks that the attention rules look at, least recently touched first
 * (so the tasks that have waited longest are always in the pool).
 */
async function candidatePool(ctx: ServiceContext): Promise<TaskView[]> {
  const rows = await ctx.scope.list(tasks, {
    where: and(
      isNull(tasks.parentTaskId),
      isNull(tasks.droppedAt),
      inArray(tasks.status, ["pending", "in_progress"]),
    ),
    orderBy: [asc(tasks.lastActivityAt)],
    limit: CANDIDATE_POOL_LIMIT,
  });
  return taskViews(ctx, rows);
}

export async function getPlan(ctx: ServiceContext, date: string): Promise<DayPlanView> {
  const [plan] = await ctx.scope.list(dayPlans, {
    where: eq(dayPlans.planDate, date),
    limit: 1,
  });
  if (!plan) return { date, confirmed: false, confirmedAt: null, tasks: [] };

  const items = await ctx.scope.list(dayPlanItems, {
    where: eq(dayPlanItems.dayPlanId, plan.id),
    orderBy: asc(dayPlanItems.position),
  });
  const taskIds = items.map((item) => item.taskId);
  const rows =
    taskIds.length === 0
      ? []
      : await ctx.scope.list(tasks, {
          where: and(inArray(tasks.id, taskIds), isNull(tasks.droppedAt)),
        });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered = taskIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });

  return {
    date,
    confirmed: plan.confirmed,
    confirmedAt: plan.confirmedAt ? plan.confirmedAt.toISOString() : null,
    tasks: await taskViews(ctx, ordered),
  };
}

export async function getToday(ctx: ServiceContext): Promise<TodayView> {
  return {
    date: ctx.today,
    timeZone: ctx.timeZone,
    plan: await getPlan(ctx, ctx.today),
  };
}

/**
 * Replaces the whole plan for a day (order included). Editing is always allowed. Passing
 * `confirmed` sets the confirmed flag; leaving it out keeps the current flag.
 */
export async function putPlan(
  ctx: ServiceContext,
  date: string,
  body: { taskIds: string[]; confirmed?: boolean },
): Promise<DayPlanView> {
  if (body.taskIds.length > 0) {
    const found = await ctx.scope.list(tasks, {
      where: and(inArray(tasks.id, body.taskIds), isNull(tasks.droppedAt)),
    });
    if (found.length !== body.taskIds.length) {
      throw validationFailed([
        { field: "taskIds", message: "Some of those tasks could not be found." },
      ]);
    }
  }

  await ctx.scope.transaction(async (scope) => {
    // One plan per day: the request id is derived from the date, so creating it twice is safe.
    const planValues = {
      planDate: date,
      confirmed: false,
      confirmedAt: null,
    } satisfies InsertOf<typeof dayPlans>;
    const { row: plan } = await scope.create(dayPlans, planValues, {
      clientRequestId: `plan-${date}`,
    });
    await scope.remove(dayPlanItems, eq(dayPlanItems.dayPlanId, plan.id));
    if (body.taskIds.length > 0) {
      await scope.createMany(
        dayPlanItems,
        body.taskIds.map((taskId, position) => ({ dayPlanId: plan.id, taskId, position })),
      );
    }
    if (body.confirmed !== undefined) {
      const confirmPatch = patchFor<typeof dayPlans>({
        confirmed: body.confirmed,
        confirmedAt: body.confirmed ? ctx.now : null,
      });
      await scope.updateById(dayPlans, plan.id, confirmPatch);
    }
  });
  return getPlan(ctx, date);
}

export async function suggestionsFor(
  ctx: ServiceContext,
  energy: EnergyLevel | undefined,
): Promise<SuggestionsView> {
  const pool = await candidatePool(ctx);
  return {
    date: ctx.today,
    suggestions: rankSuggestions(pool, { today: ctx.today, now: ctx.now, energy }),
  };
}

const REASON_ORDER = { date_passed: 0, stale: 1 } as const;

/**
 * The fresh-look queue: tasks whose date has passed without completion, and tasks that
 * have gone quiet. Earlier dates first, then the longest-waiting ones.
 */
export async function freshLook(ctx: ServiceContext, limit: number): Promise<FreshLookItemView[]> {
  const pool = await candidatePool(ctx);
  const items: FreshLookItemView[] = [];
  for (const task of pool) {
    const reason = freshLookReason(task, ctx.today, ctx.now);
    if (reason) items.push({ task, reason });
  }
  items.sort((a, b) => {
    if (a.reason !== b.reason) return REASON_ORDER[a.reason] - REASON_ORDER[b.reason];
    if (a.reason === "date_passed") {
      return (a.task.dueDate ?? "").localeCompare(b.task.dueDate ?? "");
    }
    return Date.parse(a.task.lastActivityAt) - Date.parse(b.task.lastActivityAt);
  });
  return items.slice(0, limit);
}

/**
 * Resurfacing candidates: tasks that have gone quiet (no activity for the stale threshold),
 * longest-waiting first. Used by Today and, through the service layer, by the Nudges agent.
 */
export async function resurfacingCandidates(
  ctx: ServiceContext,
  limit: number,
): Promise<TaskView[]> {
  const pool = await candidatePool(ctx);
  return pool
    .filter(
      (task) =>
        isStale(task.lastActivityAt, ctx.now) &&
        (task.snoozedUntil === null || task.snoozedUntil <= ctx.today) &&
        task.recurrence?.paused !== true,
    )
    .slice(0, limit);
}
