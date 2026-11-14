import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { AUTH_COOKIE_PREFIX, SIGN_IN_PATH } from "@/shared/auth";
import { env } from "@/server/env";
import { db } from "@/server/db/raw";
import * as schema from "@/server/db/schema";
import { logWarn } from "@/server/log";
import { isEmailAllowed } from "./allow-list";
import { testLogin } from "./test-login";

/**
 * Better Auth, configured for FlowZone:
 *   - Google is the only way to sign in (no passwords, no email links).
 *   - Sign-up is CLOSED: only emails in ALLOWED_EMAILS can ever get an account or a session.
 *   - Sessions are secure, HTTP-only cookies stored in the database (30 days, sliding).
 *
 * Application code should not import this directly. Use `requireUser()` /
 * `requirePageUser()` from "./current-user" to find out who is signed in.
 */

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const ONE_DAY = 60 * 60 * 24;

/** Better Auth turns this into `/sign-in?error=not_allowed&error_description=…`. */
function notAllowed(): never {
  throw APIError.from("FORBIDDEN", {
    code: "not_allowed",
    message: "This account isn't on the invite list.",
  });
}

export const auth = betterAuth({
  appName: "FlowZone",
  baseURL: env.baseUrl,
  secret: env.authSecret,
  database: drizzleAdapter(db, { provider: "pg", schema }),

  emailAndPassword: { enabled: false },
  socialProviders: {
    google: {
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
      // Always show the account chooser so people with several Google accounts pick deliberately.
      prompt: "select_account",
    },
  },

  session: { expiresIn: THIRTY_DAYS, updateAge: ONE_DAY },

  advanced: {
    cookiePrefix: AUTH_COOKIE_PREFIX,
    // Cookies are HTTPS-only whenever the app is served over HTTPS (always, off localhost).
    useSecureCookies: env.baseUrl.startsWith("https://"),
  },

  // Sign-in failures land on our own friendly page instead of Better Auth's default one.
  onAPIError: { errorURL: SIGN_IN_PATH },

  databaseHooks: {
    user: {
      create: {
        // Closed sign-up: a stranger can never create an account.
        before: async (user) => {
          if (!isEmailAllowed(user.email)) {
            logWarn("auth.signup_refused");
            notAllowed();
          }
        },
      },
    },
    session: {
      create: {
        // A person removed from the list can no longer start a new session.
        before: async (session) => {
          const [owner] = await db
            .select({ email: schema.user.email })
            .from(schema.user)
            .where(eq(schema.user.id, session.userId))
            .limit(1);
          if (!owner || !isEmailAllowed(owner.email)) {
            logWarn("auth.session_refused");
            notAllowed();
          }
        },
      },
    },
  },

  plugins: [
    // Only registered when allowed (never in production). See ./test-login.ts.
    ...(env.testLoginEnabled ? [testLogin()] : []),
    // Must stay last: lets server actions set/clear auth cookies.
    nextCookies(),
  ],
});

export type Auth = typeof auth;
