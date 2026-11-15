"use client";

/**
 * Actions that change a task, shared by every screen so they behave the same everywhere.
 *
 * Repeating tasks: completing always names the occurrence the person saw (`dueDate` is the
 * current occurrence on the screen), so a repeated tap cannot act on the next one
 * (docs/contracts/api.md, 3.3).
 */
import type { RecurrenceRule } from "@/shared/recurrence";
import type { TaskView } from "@/shared/views";
import { completeTask, updateTask } from "@/ui/api/resources";
import { invalidate } from "@/ui/data/query";

/** The keys that show task data. Call after any change to a task. */
export function refreshTaskViews(taskId?: string): Promise<void> {
  const keys = ["inbox", "today", "tasks", "fresh-look", "projects", "notes"];
  if (taskId) keys.push(`task:${taskId}`);
  return invalidate(...keys);
}

export function completeNow(task: TaskView): Promise<TaskView> {
  if (task.recurrence) {
    const occurrence = task.recurrence.currentOccurrence ?? task.dueDate;
    return completeTask(task.id, occurrence);
  }
  return completeTask(task.id);
}

/** Reopens a one-off task that was completed. */
export function reopenNow(task: TaskView): Promise<TaskView> {
  return updateTask(task.id, { status: "pending" });
}

/** True when the device asks for less motion, either in-app or in the system settings. */
export function lessMotion(): boolean {
  if (typeof window === "undefined") return false;
  return (
    document.documentElement.dataset.motion === "less" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function describeRule(rule: RecurrenceRule): string {
  switch (rule.type) {
    case "daily":
      return "Every day";
    case "every_n_days":
      return `Every ${rule.interval} days`;
    case "weekly": {
      const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const days = [...rule.days].sort((a, b) => a - b).map((d) => names[d]);
      return `Weekly on ${days.join(", ")}`;
    }
    case "monthly":
      return rule.day === 31
        ? "Monthly on the 31st (the last day in shorter months)"
        : `Monthly on the ${ordinal(rule.day)}`;
  }
}

function ordinal(day: number): string {
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  return `${day}${suffix}`;
}
