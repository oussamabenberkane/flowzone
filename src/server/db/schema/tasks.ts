import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { ESTIMATE_MAX_MINUTES, ESTIMATE_MIN_MINUTES } from "../../../shared/tuning";
import type { RecurrenceRule } from "../../../shared/recurrence";
import { userOwnedTable } from "../user-owned-table";
import { projects } from "./projects";

export const taskStatus = pgEnum("task_status", ["pending", "in_progress", "completed"]);
export const taskPriority = pgEnum("task_priority", ["low", "normal", "high"]);
export const taskEnergy = pgEnum("task_energy", ["low", "medium", "high"]);

/**
 * Tasks. Subtasks are tasks with `parent_task_id` set (one level only; enforced in the
 * service). Inbox = a top-level task with no project. Dates are calendar dates in the
 * owner's time zone (see docs/contracts/api.md, "Time and dates").
 *
 * For a recurring task `due_date` stays empty: its current occurrence is computed on
 * read from `recurrence_rule`, `recurrence_start` and the recurrence records.
 */
export const tasks = userOwnedTable(
  "tasks",
  {
    title: text("title").notNull(),
    status: taskStatus("status").notNull().default("pending"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    parentTaskId: uuid("parent_task_id"),
    dueDate: date("due_date", { mode: "string" }),
    dueTime: time("due_time"),
    priority: taskPriority("priority").notNull().default("normal"),
    energy: taskEnergy("energy"),
    estimateMinutes: integer("estimate_minutes"),
    recurrenceRule: jsonb("recurrence_rule").$type<RecurrenceRule>(),
    recurrenceStart: date("recurrence_start", { mode: "string" }),
    recurrencePaused: boolean("recurrence_paused").notNull().default(false),
    /** Manual ordering among siblings (lower first). */
    position: integer("position").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Set on create and on every change a person makes. Drives the stale rule. */
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    /** Hidden from suggestions and fresh-look until this calendar date (exclusive of it). */
    snoozedUntil: date("snoozed_until", { mode: "string" }),
    /** A dropped task is hidden everywhere. It is kept only so export and deletion stay complete. */
    droppedAt: timestamp("dropped_at", { withTimezone: true }),
  },
  (t) => [
    index("tasks_user_status_idx").on(t.userId, t.status),
    index("tasks_user_project_idx").on(t.userId, t.projectId, t.position),
    index("tasks_user_parent_idx").on(t.userId, t.parentTaskId, t.position),
    index("tasks_user_due_idx").on(t.userId, t.dueDate),
    index("tasks_user_activity_idx").on(t.userId, t.lastActivityAt),
    index("tasks_search_idx").using("gin", sql`to_tsvector('simple', ${t.title})`),
    foreignKey({
      name: "tasks_parent_task_id_fk",
      columns: [t.parentTaskId],
      foreignColumns: [t.id],
    }).onDelete("cascade"),
    check(
      "tasks_estimate_range",
      sql`${t.estimateMinutes} is null or (${t.estimateMinutes} between ${sql.raw(String(ESTIMATE_MIN_MINUTES))} and ${sql.raw(String(ESTIMATE_MAX_MINUTES))})`,
    ),
  ],
);
