import "server-only";
import { asc, desc } from "drizzle-orm";
import {
  dayPlanItems,
  dayPlans,
  entries,
  projects,
  recurrenceRecords,
  tasks,
  userSettings,
} from "@/server/db/schema";
import { describeRule } from "../rules/recurrence";
import { getSettings } from "../settings";
import { entryView, projectView, taskViews, type TaskRow } from "../views";
import type { ServiceContext } from "../context";
import type { LifecycleHandler, ExportFile } from "./registry";
import type { TaskView } from "@/shared/views";

/**
 * The core domain's lifecycle handler: projects, tasks, recurrence records, day plans,
 * entries and settings. Exports them as structured JSON, plus two readable Markdown files
 * (tasks and notes/journal). Deletion removes every row of the person in these tables.
 */

const JSON_INDENT = 2;

function json(value: unknown): string {
  return `${JSON.stringify(value, null, JSON_INDENT)}\n`;
}

function describeTask(task: TaskView, projectNames: ReadonlyMap<string, string>): string {
  const details: string[] = [];
  if (task.dueDate) {
    details.push(`date ${task.dueDate}${task.dueTime ? ` ${task.dueTime}` : ""}`);
  }
  if (task.priority !== "normal") details.push(`${task.priority} priority`);
  if (task.energy) details.push(`energy ${task.energy}`);
  if (task.estimateMinutes) details.push(`about ${task.estimateMinutes} min`);
  if (task.status === "in_progress") details.push("in progress");
  if (task.recurrence) {
    details.push(`repeats ${describeRule(task.recurrence.rule)}`);
    details.push(
      task.recurrence.paused
        ? "paused"
        : `current occurrence ${task.recurrence.currentOccurrence ?? "none"}`,
    );
    if (task.recurrence.consecutiveSkips > 0) {
      details.push(
        `${task.recurrence.consecutiveSkips} occurrences in a row passed without completion`,
      );
    }
  }
  if (task.snoozedUntil) details.push(`snoozed until ${task.snoozedUntil}`);
  if (task.completedAt) details.push(`completed ${task.completedAt.slice(0, 10)}`);
  if (task.projectId && projectNames.has(task.projectId)) {
    details.push(`project ${projectNames.get(task.projectId)}`);
  }
  const box = task.status === "completed" ? "[x]" : "[ ]";
  const meta = details.length > 0 ? ` (${details.join("; ")})` : "";
  return `${box} ${task.title}${meta}`;
}

function readableTasks(
  views: readonly (TaskView & { droppedAt: string | null })[],
  projectNames: ReadonlyMap<string, string>,
  timeZone: string,
): string {
  const top = views.filter((view) => view.parentTaskId === null);
  const childrenOf = (id: string) =>
    views.filter((view) => view.parentTaskId === id).sort((a, b) => a.position - b.position);

  const render = (view: TaskView & { droppedAt: string | null }, depth: number): string[] => {
    const indent = "  ".repeat(depth);
    const lines = [`${indent}- ${describeTask(view, projectNames)}`];
    for (const child of childrenOf(view.id)) lines.push(...render(child, depth + 1));
    return lines;
  };

  const sections: string[] = [`# Your tasks`, "", `Time zone: ${timeZone}`, ""];
  const live = top.filter((view) => view.droppedAt === null);
  const sectionOf = (view: TaskView) =>
    view.projectId && projectNames.has(view.projectId)
      ? (projectNames.get(view.projectId) as string)
      : "Inbox";
  const names = [...new Set(live.map(sectionOf))].sort((a, b) => {
    if (a === "Inbox") return -1;
    if (b === "Inbox") return 1;
    return a.localeCompare(b);
  });
  for (const name of names) {
    sections.push(`## ${name}`, "");
    for (const view of live.filter((item) => sectionOf(item) === name)) {
      sections.push(...render(view, 0));
    }
    sections.push("");
  }

  const dropped = top.filter((view) => view.droppedAt !== null);
  if (dropped.length > 0) {
    sections.push("## Dropped (kept for your records)", "");
    for (const view of dropped) sections.push(...render(view, 0));
    sections.push("");
  }
  return `${sections.join("\n")}\n`;
}

function readableEntries(
  rows: readonly { kind: string; title: string | null; body: string; entryDate: string }[],
): string {
  const lines = ["# Notes and journal", ""];
  for (const row of rows) {
    const kind = row.kind === "journal" ? "Journal" : "Note";
    const heading = row.title
      ? `${row.entryDate} · ${kind} · ${row.title}`
      : `${row.entryDate} · ${kind}`;
    lines.push(`## ${heading}`, "", row.body.trim() === "" ? "(no text)" : row.body.trim(), "");
  }
  return `${lines.join("\n")}\n`;
}

export const coreLifecycleHandler: LifecycleHandler = {
  id: "core",
  title: "Tasks, projects, recurring tasks, notes and journal, day plans and settings",

  async exportFiles(ctx: ServiceContext): Promise<ExportFile[]> {
    const projectRows = await ctx.scope.list(projects, {
      orderBy: [asc(projects.position), asc(projects.name)],
    });
    const taskRows: TaskRow[] = await ctx.scope.list(tasks, {
      orderBy: [asc(tasks.createdAt)],
    });
    const views = await taskViews(ctx, taskRows);
    const droppedById = new Map(taskRows.map((row) => [row.id, row.droppedAt]));
    const taskExport = views.map((view) => ({
      ...view,
      droppedAt: droppedById.get(view.id)?.toISOString() ?? null,
    }));

    const records = await ctx.scope.list(recurrenceRecords, {
      orderBy: [asc(recurrenceRecords.occurrenceDate)],
    });
    const plans = await ctx.scope.list(dayPlans, { orderBy: [asc(dayPlans.planDate)] });
    const items = await ctx.scope.list(dayPlanItems, { orderBy: [asc(dayPlanItems.position)] });
    const entryRows = await ctx.scope.list(entries, {
      orderBy: [desc(entries.entryDate), desc(entries.createdAt)],
    });
    const settings = await getSettings(ctx);
    const projectNames = new Map(projectRows.map((row) => [row.id, row.name]));

    return [
      {
        path: "data/account.json",
        content: json({ email: ctx.user.email, name: ctx.user.name }),
      },
      { path: "data/settings.json", content: json(settings) },
      { path: "data/projects.json", content: json(projectRows.map(projectView)) },
      { path: "data/tasks.json", content: json(taskExport) },
      {
        path: "data/recurrence-records.json",
        content: json(
          records.map((record) => ({
            taskId: record.taskId,
            occurrenceDate: record.occurrenceDate,
            outcome: record.outcome,
            recordedAt: record.createdAt.toISOString(),
          })),
        ),
      },
      {
        path: "data/day-plans.json",
        content: json(
          plans.map((plan) => ({
            date: plan.planDate,
            confirmed: plan.confirmed,
            confirmedAt: plan.confirmedAt?.toISOString() ?? null,
            tasks: items
              .filter((item) => item.dayPlanId === plan.id)
              .map((item) => ({ taskId: item.taskId, position: item.position })),
          })),
        ),
      },
      { path: "data/entries.json", content: json(entryRows.map(entryView)) },
      {
        path: "readable/tasks.md",
        content: readableTasks(taskExport, projectNames, settings.timeZone),
      },
      { path: "readable/notes-and-journal.md", content: readableEntries(entryRows) },
    ];
  },

  async deleteData(ctx: ServiceContext): Promise<void> {
    await ctx.scope.transaction(async (scope) => {
      await scope.removeAll(entries);
      await scope.removeAll(dayPlanItems);
      await scope.removeAll(dayPlans);
      await scope.removeAll(recurrenceRecords);
      await scope.removeAll(tasks);
      await scope.removeAll(projects);
      await scope.removeAll(userSettings);
    });
  },
};
