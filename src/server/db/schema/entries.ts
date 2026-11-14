import { sql } from "drizzle-orm";
import { date, index, pgEnum, text, uuid } from "drizzle-orm/pg-core";
import { userOwnedTable } from "../user-owned-table";
import { projects } from "./projects";
import { tasks } from "./tasks";

export const entryKind = pgEnum("entry_kind", ["note", "journal"]);

/**
 * Notes and journal entries: one concept. A journal entry is a note with kind "journal"
 * and usually no task or project. An optional end-of-day reflection is a journal entry.
 * Deleting a task or project keeps its entries (the link is cleared).
 */
export const entries = userOwnedTable(
  "entries",
  {
    kind: entryKind("kind").notNull(),
    title: text("title"),
    body: text("body").notNull().default(""),
    /** The calendar day the entry belongs to, in the owner's time zone. */
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  },
  (t) => [
    index("entries_user_date_idx").on(t.userId, t.entryDate),
    index("entries_user_task_idx").on(t.userId, t.taskId),
    index("entries_user_project_idx").on(t.userId, t.projectId),
    index("entries_search_idx").using(
      "gin",
      sql`to_tsvector('simple', coalesce(${t.title}, '') || ' ' || ${t.body})`,
    ),
  ],
);
