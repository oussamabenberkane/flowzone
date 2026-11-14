import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SIGN_IN_PATH } from "@/shared/auth";
import { type SessionState, readSession } from "./session";
import type { UserContext } from "./user-context";

/**
 * How PAGES (Server Components) find out who is signed in.
 *
 *   API routes   -> don't call these; wrap the handler in `userRoute()`
 *                   (src/server/http/route.ts), which uses `requireUser()` from "./session".
 *   Pages        -> `await requirePageUser()` (redirects to sign-in when signed out).
 *
 * In a Server Component, reading the session uses request headers, so (with Cache
 * Components on) it must happen inside a <Suspense> boundary. See src/app/page.tsx.
 */

// React's cache() makes several components in one render share a single session lookup.
const readPageSession = cache(async (): Promise<SessionState> => readSession(await headers()));

/** For pages: the session state, without redirecting. */
export async function getPageSession(): Promise<SessionState> {
  return readPageSession();
}

/** For pages: the signed-in user, or redirects to the sign-in page. */
export async function requirePageUser(): Promise<UserContext> {
  const state = await readPageSession();
  if (state.status === "signed-in") return state.user;
  redirect(state.status === "not-allowed" ? `${SIGN_IN_PATH}?error=not_allowed` : SIGN_IN_PATH);
}
