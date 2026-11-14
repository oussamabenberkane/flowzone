/**
 * THE approved way to read and write user data.
 *
 *   const scope = forUser(user);                       // `user` is a UserContext
 *   const rows = await scope.list(tasks, { where: eq(tasks.done, false) });
 *
 * Why this is safe by design:
 *   1. You cannot call it without a `UserContext` (a type nobody can forge; see
 *      src/server/auth/user-context.ts).
 *   2. Every operation adds `WHERE user_id = <that user>` itself. There is no
 *      parameter to turn it off, and new rows get `user_id` from the context, never
 *      from request data.
 *   3. It only accepts tables made with `userOwnedTable()`, so the owner column is
 *      guaranteed to exist.
 *   4. The raw database client lives in ./raw.ts and ESLint forbids importing it from
 *      domain code. No function in this file returns it.
 *
 * Rules for `where` fragments you pass in: build them only from columns of the
 * table you are querying (`eq(tasks.done, false)`, `and(...)`, `ilike(...)`).
 * They are combined with the owner filter using AND, so they can only narrow results.
 * Do not put sub-selects on other tables in them.
 *
 * Need something this file does not offer (a join, an aggregate)? Add a new method
 * HERE so the owner filter is applied in one reviewed place; do not reach for the
 * raw client.
 */
import "server-only";
import {
  type InferInsertModel,
  type InferSelectModel,
  type SQL,
  and,
  count as countRows,
  eq,
  sql,
} from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { UserContext } from "@/server/auth/user-context";
import { db } from "./raw";
import { type UserOwnedTable, RESERVED_COLUMNS, isUserOwnedTable } from "./user-owned-table";

type Reserved = (typeof RESERVED_COLUMNS)[number];

/** A row as stored. */
export type Row<T extends UserOwnedTable> = InferSelectModel<T>;
/** What you provide when creating: everything except the standard columns. */
export type NewRow<T extends UserOwnedTable> = Omit<InferInsertModel<T>, Reserved>;
/** What you provide when updating: any subset of your own columns. */
export type RowPatch<T extends UserOwnedTable> = Partial<NewRow<T>>;

export interface ListQuery {
  where?: SQL;
  orderBy?: SQL | AnyPgColumn | Array<SQL | AnyPgColumn>;
  limit?: number;
  offset?: number;
}

export interface CreateResult<T extends UserOwnedTable> {
  row: Row<T>;
  /** false when the same `clientRequestId` was used before and the existing row was returned. */
  created: boolean;
}

export interface UserScope {
  /** The owner every operation is confined to. */
  readonly userId: string;

  /** Rows of this user, optionally filtered, ordered and paged. */
  list<T extends UserOwnedTable>(table: T, query?: ListQuery): Promise<Row<T>[]>;
  /** The first of this user's rows matching `where`, or null. */
  find<T extends UserOwnedTable>(table: T, where: SQL): Promise<Row<T> | null>;
  /** One of this user's rows by id, or null (also null when the id belongs to someone else). */
  findById<T extends UserOwnedTable>(table: T, id: string): Promise<Row<T> | null>;
  /** How many of this user's rows match. */
  count<T extends UserOwnedTable>(table: T, where?: SQL): Promise<number>;

  /**
   * Create a row owned by this user. Pass `clientRequestId` to make it idempotent:
   * the second call with the same id returns the first row with `created: false`.
   */
  create<T extends UserOwnedTable>(
    table: T,
    values: NewRow<T>,
    options?: { clientRequestId?: string },
  ): Promise<CreateResult<T>>;
  /** Create several rows at once (imports, seeding). Not idempotent. */
  createMany<T extends UserOwnedTable>(table: T, values: NewRow<T>[]): Promise<Row<T>[]>;

  /** Update this user's rows matching `where`; returns the updated rows. */
  update<T extends UserOwnedTable>(table: T, where: SQL, patch: RowPatch<T>): Promise<Row<T>[]>;
  /** Update one row by id; null if it does not exist for this user. */
  updateById<T extends UserOwnedTable>(
    table: T,
    id: string,
    patch: RowPatch<T>,
  ): Promise<Row<T> | null>;

  /** Delete this user's rows matching `where`; returns how many were deleted. */
  remove<T extends UserOwnedTable>(table: T, where: SQL): Promise<number>;
  /** Delete one row by id; false if it does not exist for this user. */
  removeById<T extends UserOwnedTable>(table: T, id: string): Promise<boolean>;
  /** Delete EVERY row of this user in the table (account / data deletion). */
  removeAll<T extends UserOwnedTable>(table: T): Promise<number>;

  /** Run several operations atomically. Use the `scope` passed to the callback inside it. */
  transaction<R>(work: (scope: UserScope) => Promise<R>): Promise<R>;
}

type Executor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

/** The standard columns of any user-owned table, for internal use. */
type Owned = UserOwnedTable;

function assertOwnedTable(table: unknown): asserts table is Owned {
  if (!isUserOwnedTable(table)) {
    throw new Error("The scoped data layer only works with tables created by userOwnedTable().");
  }
}

function assertNoReservedKeys(values: object, action: string) {
  for (const key of RESERVED_COLUMNS) {
    if (key in values) {
      throw new Error(
        `Cannot ${action} "${key}": it is a standard column managed by the data layer.`,
      );
    }
  }
}

class Scope implements UserScope {
  constructor(
    readonly userId: string,
    private readonly executor: Executor,
    private readonly runInTransaction: <R>(work: (scope: UserScope) => Promise<R>) => Promise<R>,
  ) {}

  /** The owner filter, ANDed with the caller's own condition. The only place it is built. */
  private owned(table: Owned, where?: SQL): SQL {
    const mine = eq(table.userId, this.userId);
    return (where ? and(mine, where) : mine) as SQL;
  }

  // Inside this class tables are handled as the non-generic `UserOwnedTable` and rows as
  // plain records; the public signatures (above) restore the precise per-table types.

  async list<T extends UserOwnedTable>(table: T, query: ListQuery = {}): Promise<Row<T>[]> {
    assertOwnedTable(table);
    const t: Owned = table;
    const order = query.orderBy === undefined ? [] : [query.orderBy].flat();
    let builder = this.executor
      .select()
      .from(t)
      .where(this.owned(t, query.where))
      .orderBy(...order)
      .$dynamic();
    if (query.limit !== undefined) builder = builder.limit(query.limit);
    if (query.offset !== undefined) builder = builder.offset(query.offset);
    return (await builder) as Row<T>[];
  }

  async find<T extends UserOwnedTable>(table: T, where: SQL): Promise<Row<T> | null> {
    const [row] = await this.list(table, { where, limit: 1 });
    return row ?? null;
  }

  findById<T extends UserOwnedTable>(table: T, id: string): Promise<Row<T> | null> {
    assertOwnedTable(table);
    const t: Owned = table;
    return this.find(table, eq(t.id, id));
  }

  async count<T extends UserOwnedTable>(table: T, where?: SQL): Promise<number> {
    assertOwnedTable(table);
    const t: Owned = table;
    const [result] = await this.executor
      .select({ total: countRows() })
      .from(t)
      .where(this.owned(t, where));
    return result?.total ?? 0;
  }

  async create<T extends UserOwnedTable>(
    table: T,
    values: NewRow<T>,
    options: { clientRequestId?: string } = {},
  ): Promise<CreateResult<T>> {
    assertOwnedTable(table);
    assertNoReservedKeys(values, "set");
    const t: Owned = table;
    const { clientRequestId } = options;

    const insert = this.executor
      .insert(t)
      .values({ ...values, userId: this.userId, clientRequestId: clientRequestId ?? null });

    if (!clientRequestId) {
      const [row] = await insert.returning();
      return { row: row as Row<T>, created: true };
    }

    // Idempotent path. If this user already used this id, the insert does nothing
    // and we hand back the row created the first time.
    const [inserted] = await insert
      .onConflictDoNothing({ target: [t.userId, t.clientRequestId] })
      .returning();
    if (inserted) return { row: inserted as Row<T>, created: true };

    const existing = await this.find(table, eq(t.clientRequestId, clientRequestId));
    if (!existing) {
      // Only possible if the first row was deleted between the two statements.
      throw new Error("Idempotent create conflicted but the existing row could not be found.");
    }
    return { row: existing, created: false };
  }

  async createMany<T extends UserOwnedTable>(table: T, values: NewRow<T>[]): Promise<Row<T>[]> {
    assertOwnedTable(table);
    if (values.length === 0) return [];
    for (const entry of values) assertNoReservedKeys(entry, "set");
    const t: Owned = table;
    const rows = await this.executor
      .insert(t)
      .values(values.map((entry) => ({ ...entry, userId: this.userId })))
      .returning();
    return rows as Row<T>[];
  }

  async update<T extends UserOwnedTable>(
    table: T,
    where: SQL,
    patch: RowPatch<T>,
  ): Promise<Row<T>[]> {
    assertOwnedTable(table);
    assertNoReservedKeys(patch, "change");
    if (Object.keys(patch).length === 0) return this.list(table, { where });
    const t: Owned = table;
    const rows = await this.executor
      .update(t)
      .set({ ...patch, updatedAt: sql`now()` })
      .where(this.owned(t, where))
      .returning();
    return rows as Row<T>[];
  }

  async updateById<T extends UserOwnedTable>(
    table: T,
    id: string,
    patch: RowPatch<T>,
  ): Promise<Row<T> | null> {
    assertOwnedTable(table);
    const t: Owned = table;
    const [row] = await this.update(table, eq(t.id, id), patch);
    return row ?? null;
  }

  async remove<T extends UserOwnedTable>(table: T, where: SQL): Promise<number> {
    assertOwnedTable(table);
    const t: Owned = table;
    const deleted = await this.executor
      .delete(t)
      .where(this.owned(t, where))
      .returning({ id: t.id });
    return deleted.length;
  }

  async removeById<T extends UserOwnedTable>(table: T, id: string): Promise<boolean> {
    assertOwnedTable(table);
    const t: Owned = table;
    return (await this.remove(table, eq(t.id, id))) > 0;
  }

  async removeAll<T extends UserOwnedTable>(table: T): Promise<number> {
    assertOwnedTable(table);
    const t: Owned = table;
    const deleted = await this.executor.delete(t).where(this.owned(t)).returning({ id: t.id });
    return deleted.length;
  }

  transaction<R>(work: (scope: UserScope) => Promise<R>): Promise<R> {
    return this.runInTransaction(work);
  }
}

function scopeOn(userId: string, executor: Executor): UserScope {
  const runInTransaction = <R>(work: (scope: UserScope) => Promise<R>): Promise<R> =>
    // Postgres savepoints make nested `transaction()` calls safe as well.
    (executor as typeof db).transaction((tx) => work(scopeOn(userId, tx)));
  return new Scope(userId, executor, runInTransaction);
}

/** The ONLY entry point for reading and writing user data. */
export function forUser(user: UserContext): UserScope {
  if (typeof user?.userId !== "string" || user.userId === "") {
    throw new Error("forUser() needs a UserContext from requireUser() or contextForUser().");
  }
  return scopeOn(user.userId, db);
}
