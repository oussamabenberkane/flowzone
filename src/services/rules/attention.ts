import "server-only";
import { MILLISECONDS_PER_DAY, addDays } from "@/shared/calendar";
import { DUE_SOON_DAYS, STALE_THRESHOLD_DAYS, TODAY_SUGGESTION_SIZE } from "@/shared/tuning";
import type {
  EnergyLevel,
  FreshLookReason,
  SuggestionReason,
  SuggestionView,
  TaskView,
} from "@/shared/views";

/**
 * Rules that decide what needs attention. Pure functions over task views: no database
 * access, no AI. The wording rule applies here too: nothing in these results is ever
 * described as "overdue" or "late", and no field counts days late.
 *
 * Tuning values come from src/shared/tuning.ts (docs/contracts/api.md, "Tuning constants").
 */

const ENERGY_RANK: Record<EnergyLevel, number> = { low: 1, medium: 2, high: 3 };

/** True when the task has had no activity for the stale threshold or longer. */
export function isStale(lastActivityAt: string, now: Date): boolean {
  return Date.parse(lastActivityAt) < now.getTime() - STALE_THRESHOLD_DAYS * MILLISECONDS_PER_DAY;
}

/** True when the task is hidden from suggestions and fresh-look until a later day. */
function isSnoozed(task: TaskView, today: string): boolean {
  return task.snoozedUntil !== null && task.snoozedUntil > today;
}

/**
 * Why a task needs a fresh look, or null. Completed, snoozed and paused tasks never do.
 * A recurring task only ever needs a fresh look because it has gone quiet: its date
 * cannot "pass", since a missed occurrence is skipped silently.
 */
export function freshLookReason(task: TaskView, today: string, now: Date): FreshLookReason | null {
  if (task.status === "completed") return null;
  if (isSnoozed(task, today)) return null;
  if (task.recurrence?.paused) return null;
  if (!task.recurrence && task.dueDate !== null && task.dueDate < today) return "date_passed";
  if (isStale(task.lastActivityAt, now)) return "stale";
  return null;
}

export interface SuggestionOptions {
  today: string;
  now: Date;
  energy?: EnergyLevel;
  limit?: number;
}

/**
 * Today's suggestion: the best few open tasks, with the reasons for each.
 *
 * Eligible when at least one reason applies: due today or earlier, due within the
 * "due soon" window, in progress, high priority, or resurfacing (gone quiet). Tasks that
 * need more energy than the person has picked are left out; tasks with no energy level
 * are always kept.
 *
 * Ranking: a points score (see SCORE below), then the earliest due date, then manual
 * order, then the task that has waited longest for attention.
 */
const SCORE = {
  due_today: 5,
  due_soon: 3,
  in_progress: 3,
  high_priority: 2,
  resurfacing: 2,
  low_priority_penalty: -1,
} as const;

export function rankSuggestions(
  tasks: readonly TaskView[],
  options: SuggestionOptions,
): SuggestionView[] {
  const limit = options.limit ?? TODAY_SUGGESTION_SIZE;
  const dueSoonUntil = addDays(options.today, DUE_SOON_DAYS);
  const scored: Array<{ view: SuggestionView; score: number }> = [];

  for (const task of tasks) {
    if (task.status === "completed") continue;
    if (task.recurrence?.paused) continue;
    if (isSnoozed(task, options.today)) continue;
    if (
      options.energy !== undefined &&
      task.energy !== null &&
      ENERGY_RANK[task.energy] > ENERGY_RANK[options.energy]
    ) {
      continue;
    }

    const reasons: SuggestionReason[] = [];
    let score = 0;
    if (task.dueDate !== null) {
      if (task.dueDate <= options.today) {
        reasons.push("due_today");
        score += SCORE.due_today;
      } else if (task.dueDate <= dueSoonUntil) {
        reasons.push("due_soon");
        score += SCORE.due_soon;
      }
    }
    if (task.status === "in_progress") {
      reasons.push("in_progress");
      score += SCORE.in_progress;
    }
    if (task.priority === "high") {
      reasons.push("high_priority");
      score += SCORE.high_priority;
    }
    if (isStale(task.lastActivityAt, options.now)) {
      reasons.push("resurfacing");
      score += SCORE.resurfacing;
    }
    if (reasons.length === 0) continue;
    if (task.priority === "low") score += SCORE.low_priority_penalty;

    scored.push({ view: { task, reasons }, score });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    const aDue = a.view.task.dueDate ?? "9999-12-31";
    const bDue = b.view.task.dueDate ?? "9999-12-31";
    if (aDue !== bDue) return aDue < bDue ? -1 : 1;
    if (a.view.task.position !== b.view.task.position) {
      return a.view.task.position - b.view.task.position;
    }
    return Date.parse(a.view.task.lastActivityAt) - Date.parse(b.view.task.lastActivityAt);
  });

  return scored.slice(0, limit).map((entry) => entry.view);
}
