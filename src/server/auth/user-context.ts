import "server-only";

/**
 * `UserContext` is the proof that "an authenticated, allowed person is acting".
 *
 * Every function in the scoped data layer (`@/server/db/scoped`) requires one.
 * It cannot be forged in application code:
 *   - the brand below is private to this file, so an object literal can never satisfy the type;
 *   - the only function that creates one, `mintUserContext`, is blocked by ESLint
 *     outside `src/server/auth/**` and `scripts/**`.
 *
 * Get one with `requireUser()` (API routes), `requirePageUser()` (pages) or, for
 * trusted background work acting for a specific person, `system-context.ts`.
 */
declare const userContextBrand: unique symbol;

export interface UserContext {
  readonly [userContextBrand]: true;
  /** The owner id stored in every user-owned row's `user_id` column. */
  readonly userId: string;
  readonly email: string;
  readonly name: string;
}

/** INTERNAL: do not call from domain code. Restricted by ESLint. */
export function mintUserContext(user: { id: string; email: string; name: string }): UserContext {
  if (!user.id) throw new Error("mintUserContext: a user id is required");
  return Object.freeze({ userId: user.id, email: user.email, name: user.name }) as UserContext;
}
