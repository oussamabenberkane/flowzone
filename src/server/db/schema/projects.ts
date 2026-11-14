import { index, integer, text } from "drizzle-orm/pg-core";
import { userOwnedTable } from "../user-owned-table";

/**
 * Projects are flat (no nesting). A task or entry may belong to one project, or none
 * (no project = Inbox for tasks). Contract: docs/contracts/api.md.
 */
export const projects = userOwnedTable(
  "projects",
  {
    name: text("name").notNull(),
    /** Manual ordering in the project list (lower first). */
    position: integer("position").notNull().default(0),
  },
  (t) => [index("projects_user_position_idx").on(t.userId, t.position)],
);
