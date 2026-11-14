import "server-only";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import * as z from "zod";
import { TEST_USER_EMAIL_DOMAIN, TEST_USER_NAME_PATTERN } from "@/shared/auth";
import { detectAppEnv } from "@/server/env";

/**
 * TEST-ONLY LOGIN, for automated tests (Playwright). It lets a test sign in as a
 * named test user without Google:
 *
 *   POST /api/auth/test-login      { "user": "alice" }
 *   -> 200, sets the normal session cookie, returns { user: { id, email, name } }
 *
 * It is impossible to switch on in production. THREE independent guards:
 *   1. Startup: src/server/env.ts refuses to start when ENABLE_TEST_LOGIN=true in production.
 *   2. Registration: auth.ts only adds this plugin when the startup check says it is enabled,
 *      so in production the endpoint does not exist at all.
 *   3. Request time (below): the endpoint re-reads the raw environment and answers
 *      404 unless the flag is on AND the deployment is not production.
 *
 * Test users live on the reserved ".invalid" domain, so they can never be real people.
 * See docs/contracts/foundation.md for how tests should use it.
 */

/** Re-checked on every request, independently of the value computed at startup. */
export function isTestLoginAllowedNow(source: NodeJS.ProcessEnv = process.env): boolean {
  const flagIsOn = source.ENABLE_TEST_LOGIN === "true";
  const isProduction = detectAppEnv(source) === "production";
  return flagIsOn && !isProduction;
}

export const testLogin = () =>
  ({
    id: "test-login",
    endpoints: {
      testLogin: createAuthEndpoint(
        "/test-login",
        {
          method: "POST",
          body: z.object({ user: z.string().regex(TEST_USER_NAME_PATTERN) }),
        },
        async (ctx) => {
          if (!isTestLoginAllowedNow()) {
            // Indistinguishable from a route that does not exist.
            throw APIError.from("NOT_FOUND", { code: "not_found", message: "Not found" });
          }

          const name = ctx.body.user;
          const email = `${name}@${TEST_USER_EMAIL_DOMAIN}`;

          const existing = await ctx.context.internalAdapter.findUserByEmail(email);
          const user =
            existing?.user ??
            (await ctx.context.internalAdapter.createUser(
              { email, name: `Test ${name}`, emailVerified: true },
              { method: "test-login" },
            ));
          if (!user) {
            throw APIError.from("INTERNAL_SERVER_ERROR", {
              code: "test_login_failed",
              message: "Could not create the test user",
            });
          }

          const session = await ctx.context.internalAdapter.createSession(user.id);
          if (!session) {
            throw APIError.from("INTERNAL_SERVER_ERROR", {
              code: "test_login_failed",
              message: "Could not create a session",
            });
          }

          await setSessionCookie(ctx, { session, user });
          return ctx.json({ user: { id: user.id, email: user.email, name: user.name } });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
