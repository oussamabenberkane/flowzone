/**
 * RESTRICTED: the raw database client.
 *
 * This is the only place a database connection is created. It is NOT part of the
 * approved way to touch user data. ESLint blocks importing this file from anywhere
 * except `src/server/db/**`, `src/server/auth/**` (Better Auth's own tables),
 * `src/app/api/health/**` and `scripts/**`.
 *
 * Domain code reads and writes user data ONLY through `forUser()` in `./scoped.ts`.
 *
 * Connection pooling (serverless):
 *   - `DATABASE_URL` should be the POOLED connection string (Neon's "-pooler" host,
 *     PgBouncer in transaction mode). It lets many short-lived function instances
 *     share a small number of real database connections.
 *   - Each warm function instance keeps ONE small `pg` pool (max 5) in a global so it
 *     is reused across requests and across dev hot-reloads.
 *   - `attachDatabasePool` (from @vercel/functions) closes idle connections just
 *     before Vercel suspends an instance, so connections never leak.
 *   - Migrations use the DIRECT string (`DATABASE_URL_UNPOOLED`); see scripts/migrate.ts.
 *   - Do not use session-level features (advisory locks, LISTEN/NOTIFY, SET without
 *     LOCAL) through the pooled connection; they do not survive transaction pooling.
 */
import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/server/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __flowzonePool?: Pool };

function createPool(): Pool {
  const pool = new Pool({
    connectionString: env.databaseUrl,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  // An idle client erroring (for example the server restarting) must not crash the process.
  pool.on("error", () => {});
  attachDatabasePool(pool);
  return pool;
}

const pool = (globalForDb.__flowzonePool ??= createPool());

export const db = drizzle(pool, { schema });
export type Database = typeof db;

/** Cheap connectivity check used by the health endpoint. Resolves to true/false, never throws. */
export async function pingDatabase(timeoutMs = 3_000): Promise<boolean> {
  try {
    await Promise.race([
      pool.query("select 1"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ]);
    return true;
  } catch {
    return false;
  }
}
