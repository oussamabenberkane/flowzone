import { boolean, date, index, integer, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { userOwnedTable } from "../user-owned-table";
import { tasks } from "./tasks";

/**
 * The plan for one calendar day: an ordered list of tasks and whether the person has
 * confirmed it. Contract: docs/contracts/api.md, "Today and the day plan".
 */
export const dayPlans = userOwnedTable(
  "day_plans",
  {
    planDate: date("plan_date", { mode: "string" }).notNull(),
    confirmed: boolean("confirmed").notNull().default(false),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("day_plans_user_date_uq").on(t.userId, t.planDate)],
);

export const dayPlanItems = userOwnedTable(
  "day_plan_items",
  {
    dayPlanId: uuid("day_plan_id")
      .notNull()
      .references(() => dayPlans.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (t) => [
    uniqueIndex("day_plan_items_plan_task_uq").on(t.userId, t.dayPlanId, t.taskId),
    index("day_plan_items_plan_position_idx").on(t.userId, t.dayPlanId, t.position),
  ],
);
