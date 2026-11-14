/**
 * Applies every pending SQL migration in /drizzle to the database.
 *
 *   npm run db:migrate
 *
 * - Works the same locally and on Vercel. On Vercel it runs automatically as part
 *   of `npm run vercel-build`, BEFORE `next build`, so a deployment whose
 *   migration fails never goes live.
 * - Uses the DIRECT connection (DATABASE_URL_UNPOOLED) when available. A direct
 *   connection is needed for the advisory lock below to mean anything.
 * - Safe to run repeatedly: already-applied migrations are skipped.
 * - Takes a Postgres advisory lock so two deployments building at the same time
 *   cannot run migrations at the same moment.
 * - Never prints connection strings or data.
 *
 * Migrations should be backwards compatible with the code that is currently live
 * (add before you remove), because the old code keeps serving until the new build
 * is promoted.
 */
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

loadEnvConfig(process.cwd());

// Arbitrary constant that identifies "FlowZone is migrating".
const MIGRATION_LOCK_ID = 7_265_483_901;

async function main() {
  const direct = process.env.DATABASE_URL_UNPOOLED?.trim();
  const url = direct || process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error(
      "Cannot migrate: DATABASE_URL_UNPOOLED (preferred) or DATABASE_URL is not set. See .env.example.",
    );
    process.exit(1);
  }
  if (!direct) {
    console.warn(
      "Note: DATABASE_URL_UNPOOLED is not set; migrating through DATABASE_URL. " +
        "If that is a pooled connection the migration lock is not guaranteed.",
    );
  }

  // One dedicated connection: the lock and the migration must share a session.
  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 15_000 });
  try {
    const client = await pool.connect();
    try {
      await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
      await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
      console.log("Migrations are up to date.");
    } finally {
      await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]).catch(() => {});
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // Migration errors describe the schema (for example `relation "x" already exists`),
  // never user data, and are only visible in the developer's terminal or build log.
  const name = error instanceof Error ? error.name : "Error";
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string } | null)?.code ?? "unknown";
  console.error(`Migration failed (${name}, code: ${code}): ${message}`);
  process.exit(1);
});
