import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_PREFIX, SIGN_IN_PATH } from "@/shared/auth";
import { buildErrorBody } from "@/shared/errors";

/**
 * Route protection, first line of defence.
 *
 * This only checks that a session cookie EXISTS (fast, no database). It is an
 * "optimistic" guard: it sends signed-out visitors to the sign-in page and answers
 * API calls with the standard 401. The REAL check (is the session valid, is the
 * person allowed) happens in every page (`requirePageUser`) and every API route
 * (`userRoute`). Never rely on this file alone.
 *
 * Keep it light: it must not import server-only modules or read the environment.
 */

/** Reachable without signing in. Everything else needs a session cookie. */
const PUBLIC_PATHS = [SIGN_IN_PATH, "/api/auth", "/api/health"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  if (getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX })) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(buildErrorBody("unauthenticated", crypto.randomUUID()), {
      status: 401,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  return NextResponse.redirect(new URL(SIGN_IN_PATH, request.url));
}

export const config = {
  // Skip Next internals and static files (icons, manifest, service worker, fonts, images).
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|webmanifest|txt|woff2?)$).*)",
  ],
};
