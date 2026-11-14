import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/raw";
import { user } from "@/server/db/schema";
import { isEmailAllowed } from "./allow-list";
import { type UserContext, mintUserContext } from "./user-context";

/**
 * For TRUSTED background work only: seed scripts, scheduled jobs, data export or
 * deletion on behalf of a specific person. Never call these from code that handles
 * a user's request; use `requireUser()` / `userRoute()` there.
 *
 * They do not give access to "all data". They give you a `UserContext` for one
 * person at a time, and the scoped data layer then confines every query to that
 * person. Jobs that must touch every user loop over `listUserContexts()`.
 *
 * Run scripts that use these (or anything else under src/server) with:
 *   npm run script -- scripts/your-script.ts
 * which passes `--conditions=react-server` so `import "server-only"` is allowed.
 */

/** A context for one existing, allowed person. Throws if there is no such person. */
export async function contextForUser(userId: string): Promise<UserContext> {
  const [row] = await db
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!row || !isEmailAllowed(row.email)) {
    throw new Error("contextForUser: no allowed user with that id");
  }
  return mintUserContext(row);
}

/** A context for every existing, allowed person (for jobs that run once per person). */
export async function listUserContexts(): Promise<UserContext[]> {
  const rows = await db.select({ id: user.id, email: user.email, name: user.name }).from(user);
  return rows.filter((row) => isEmailAllowed(row.email)).map(mintUserContext);
}
