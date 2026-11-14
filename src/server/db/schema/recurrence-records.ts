import { date, index, pgEnum, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { userOwnedTable } from "../user-owned-table";
import { tasks } from "./tasks";

export const recurrenceOutcome = pgEnum("recurrence_outcome", ["completed", "skipped"]);

/**
 * One row per occurrence a person completed or explicitly skipped. Occurrences that
 * passed with no row are missed and are skipped silently (they are counted, never
 * shown as a pile-up). Contract: docs/contracts/api.md, "Recurrence".
 */
export const recurrenceRecords = userOwnedTable(
  "recurrence_records",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    occurrenceDate: date("occurrence_date", { mode: "string" }).notNull(),
    outcome: recurrenceOutcome("outcome").notNull(),
  },
  (t) => [
    uniqueIndex("recurrence_records_task_occurrence_uq").on(t.userId, t.taskId, t.occurrenceDate),
    index("recurrence_records_user_task_idx").on(t.userId, t.taskId),
  ],
);
