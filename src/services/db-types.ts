import "server-only";
import type { RowPatch } from "@/server/db/scoped";
import type { UserOwnedTable } from "@/server/db/user-owned-table";

/**
 * Typing helpers for values written through the scoped data layer.
 *
 * Why these exist: the scoped layer's `NewRow<T>` (src/server/db/scoped.ts) currently
 * drops every optional column (nullable or with a default), so an inline object literal
 * that sets one fails type checking. The Foundation contract is not changed here. Instead,
 * write values as
 *
 *   const values = { title: "Call Sam", dueDate: null } satisfies InsertOf<typeof tasks>;
 *   await scope.create(tasks, values);
 *
 * `satisfies` checks the literal against the complete column list, and passing the
 * resulting variable to the scoped layer is accepted. See docs/handoff/02-backend.md,
 * "Blockers raised to Foundation".
 */

type StandardColumn = "id" | "userId" | "clientRequestId" | "createdAt" | "updatedAt";

/** Every column a row can be created with (the standard columns are managed by the data layer). */
export type InsertOf<T extends UserOwnedTable> = Omit<T["$inferInsert"], StandardColumn>;

/** Any subset of the columns, for updates. */
export type PatchOf<T extends UserOwnedTable> = Partial<InsertOf<T>>;

/**
 * Turns a patch into the type the scoped layer's update methods accept. The literal is
 * checked against every column first; the cast only bridges the incomplete type described above.
 *
 *   await scope.updateById(tasks, id, patchFor<typeof tasks>({ status: "completed" }));
 */
export function patchFor<T extends UserOwnedTable>(patch: PatchOf<T>): RowPatch<T> {
  return patch as unknown as RowPatch<T>;
}
