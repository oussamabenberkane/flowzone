import "server-only";
import { forbidden, unauthenticated } from "@/server/http/errors";
import { isEmailAllowed } from "./allow-list";
import { auth } from "./auth";
import { type UserContext, mintUserContext } from "./user-context";

/**
 * Who is signed in, decided from request headers. Free of `next/*` imports so it can
 * be used by API routes and by scripts. Pages use the helpers in "./current-user".
 */

export type SessionState =
  | { status: "signed-in"; user: UserContext }
  | { status: "signed-out" }
  /** A valid session, but the email is no longer on the allow-list. */
  | { status: "not-allowed" };

export async function readSession(requestHeaders: Headers): Promise<SessionState> {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return { status: "signed-out" };
  if (!isEmailAllowed(session.user.email)) return { status: "not-allowed" };
  return { status: "signed-in", user: mintUserContext(session.user) };
}

/** For route handlers: the signed-in user, or throws the standard 401 / 403. */
export async function requireUser(requestHeaders: Headers): Promise<UserContext> {
  const state = await readSession(requestHeaders);
  if (state.status === "signed-out") throw unauthenticated();
  if (state.status === "not-allowed") throw forbidden("This account isn't on the invite list.");
  return state.user;
}
