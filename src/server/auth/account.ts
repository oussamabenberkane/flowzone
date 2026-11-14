import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/raw";
import { user } from "@/server/db/schema";
import { auth } from "./auth";

/**
 * Account-level operations that need Better Auth or the raw database, and so must live
 * in this folder (the only place the lint rules allow them). Used by the account deletion
 * route. Domain code calls these through the lifecycle registry, never directly.
 */

/**
 * Ends the current session and returns the Set-Cookie headers that clear the cookies.
 * Call it while the session still exists (before the account is deleted).
 */
export async function endSessionForResponse(requestHeaders: Headers): Promise<string[]> {
  const result = await auth.api.signOut({ headers: requestHeaders, returnHeaders: true });
  return result.headers.getSetCookie();
}

/**
 * Deletes the sign-in record of one person. Their sessions, linked accounts and every row
 * in the user-owned tables go with it (ON DELETE CASCADE).
 */
export async function deleteAccountRecord(userId: string): Promise<void> {
  await db.delete(user).where(eq(user.id, userId));
}
