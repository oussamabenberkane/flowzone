import {
  boolean,
  date,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { userOwnedTable } from "../user-owned-table";
import { tasks } from "./tasks";

/**
 * Nudge tables (owned by the Nudges agent). Contract: docs/contracts/nudges.md.
 *
 * Nothing here changes a task. The controls table holds nudge-only settings for a task (mute,
 * snooze); the task's own snooze is a different thing and lives on the task.
 */

/**
 * Every nudge that was decided on. One row per tick window that produced a nudge (the
 * client request id is "tick-<window>", so a repeated call in the same window finds the row).
 * `outcome` counts toward the daily cap while it is "pending" or "sent".
 */
export const nudgeLog = userOwnedTable(
  "nudge_log",
  {
    kind: text("kind", { enum: ["due_soon", "check_in", "resurface"] }).notNull(),
    /** The task the nudge is about. Null if the task was deleted later. */
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    /** Stable code for the reason, for example "due_at" or "quiet". Never shown raw. */
    reasonCode: text("reason_code").notNull(),
    /** The notification text exactly as sent (it includes the reason). */
    text: text("text").notNull(),
    wording: text("wording", { enum: ["ai", "template"] }).notNull(),
    outcome: text("outcome", { enum: ["pending", "sent", "failed", "cancelled"] }).notNull(),
    /** The calendar day the nudge belongs to, in the person's time zone at the time of sending. */
    localDay: date("local_day", { mode: "string" }).notNull(),
    /**
     * The instant the decision was made, on the caller's clock (the tick's "as of" time when
     * tests set one). Gaps and caps are measured with this, never with created_at.
     */
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
    /** When the push service accepted the message (real time). Null if it did not. */
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    index("nudge_log_user_day_idx").on(t.userId, t.localDay),
    index("nudge_log_user_decided_idx").on(t.userId, t.decidedAt),
  ],
);

/** Per-task nudge controls. A row exists only while a mute or a snooze is set. */
export const nudgeTaskControls = userOwnedTable(
  "nudge_task_controls",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    muted: boolean("muted").notNull().default(false),
    /** Nudges about this task are paused until this instant. Null when not snoozed. */
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
  },
  (t) => [uniqueIndex("nudge_task_controls_user_task_uq").on(t.userId, t.taskId)],
);

/**
 * One row per device (browser) that accepted push notifications. The endpoint is the push
 * service's address for that browser; the two keys let the server encrypt the message for it.
 */
export const pushSubscriptions = userOwnedTable(
  "push_subscriptions",
  {
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    authSecret: text("auth_secret").notNull(),
    /** Short label chosen by the device, such as "Android · Chrome". */
    label: text("label").notNull(),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    /** Failed sends in a row (not counting "gone" answers, which remove the device at once). */
    failureCount: integer("failure_count").notNull().default(0),
  },
  (t) => [uniqueIndex("push_subscriptions_user_endpoint_uq").on(t.userId, t.endpoint)],
);
