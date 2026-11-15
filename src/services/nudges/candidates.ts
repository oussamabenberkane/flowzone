import "server-only";
import { NUDGE_DUE_SOON_LEAD_MINUTES } from "@/shared/nudge-tuning";
import { LIST_MAX_LIMIT, RESURFACING_MAX_LIMIT, FRESH_LOOK_DEFAULT_LIMIT } from "@/shared/tuning";
import type { TaskView } from "@/shared/views";
import type { ServiceContext } from "../context";
import { listTasks } from "../tasks";
import { freshLook, resurfacingCandidates } from "../today";
import { isNudgeSafeTitle } from "./copy";
import { type NudgeCandidate, formatClock, localClock, minutesOf } from "./policy";

/**
 * Finds what could be nudged about, using only the Backend service layer (api.md, section 6).
 * It decides nothing about caps or gaps: that is the engine's job (policy.ts).
 *
 * Three sources, in this order:
 *   due_soon  open tasks due today, with a time that is coming up within the lead time, or
 *             with no time at all (due today). A time that has already passed is never used.
 *   check_in  the fresh-look queue's "planned for an earlier day" items (one-off tasks only).
 *   resurface the resurfacing candidates: tasks that have gone quiet.
 *
 * A task appears once, under the first source that finds it.
 */
export async function nudgeCandidates(ctx: ServiceContext): Promise<NudgeCandidate[]> {
  const found: NudgeCandidate[] = [];
  const seen = new Set<string>();
  const add = (candidate: NudgeCandidate) => {
    if (seen.has(candidate.taskId) || !isNudgeSafeTitle(candidate.title)) return;
    seen.add(candidate.taskId);
    found.push(candidate);
  };

  for (const candidate of await dueSoonCandidates(ctx)) add(candidate);

  const items = await freshLook(ctx, FRESH_LOOK_DEFAULT_LIMIT);
  for (const item of items) {
    if (item.reason !== "date_passed") continue;
    add({
      kind: "check_in",
      taskId: item.task.id,
      title: item.task.title,
      reasonCode: "planned_earlier",
      reason: "was planned for an earlier day",
    });
  }

  const quiet = await resurfacingCandidates(ctx, RESURFACING_MAX_LIMIT);
  for (const task of quiet) {
    add({
      kind: "resurface",
      taskId: task.id,
      title: task.title,
      reasonCode: "quiet_for_a_while",
      reason: "has been quiet for a while",
    });
  }

  return found;
}

/** Open top-level tasks due today that are coming up (or have no time). */
async function dueSoonCandidates(ctx: ServiceContext): Promise<NudgeCandidate[]> {
  const page = await listTasks(ctx, { status: "open", limit: LIST_MAX_LIMIT, offset: 0 });
  const nowMinutes = minutesOf(localClock(ctx.now, ctx.timeZone).time);

  const timed: { task: TaskView; minutesUntil: number }[] = [];
  const undated: TaskView[] = [];
  for (const task of page.tasks) {
    if (task.dueDate !== ctx.today) continue;
    if (task.recurrence?.paused === true) continue;
    if (task.snoozedUntil !== null && task.snoozedUntil > ctx.today) continue;

    if (task.dueTime === null) {
      undated.push(task);
      continue;
    }
    const minutesUntil = minutesOf(task.dueTime) - nowMinutes;
    // Passed times are never nudged about: a missed time is not a reason to write to someone.
    if (minutesUntil >= 0 && minutesUntil <= NUDGE_DUE_SOON_LEAD_MINUTES) {
      timed.push({ task, minutesUntil });
    }
  }

  timed.sort((a, b) => a.minutesUntil - b.minutesUntil);
  return [
    ...timed.map(({ task }) => ({
      kind: "due_soon" as const,
      taskId: task.id,
      title: task.title,
      reasonCode: "due_at" as const,
      reason: `due at ${formatClock(task.dueTime ?? "00:00")}`,
    })),
    ...undated.map((task) => ({
      kind: "due_soon" as const,
      taskId: task.id,
      title: task.title,
      reasonCode: "due_today" as const,
      reason: "due today",
    })),
  ];
}
