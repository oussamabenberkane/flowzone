import "server-only";
import { z } from "zod";

/**
 * The ONE place application settings are read from `process.env`.
 *
 * - Validated once, when this module is first imported (the server also imports
 *   it at boot from `src/instrumentation.ts`). A missing or malformed variable
 *   stops the app with a clear list of what is wrong. Values are never printed.
 * - To add a variable: extend `schema` below AND document it in `.env.example`.
 * - Build scripts that only need the database (`drizzle.config.ts`,
 *   `scripts/migrate.ts`) read DATABASE_URL* directly and do not use this module.
 */

/** Treat blank values (`FOO=`) as "not set", as is common in .env files. */
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(blankToUndefined, z.string().optional());

const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\/.+/, "must be a Postgres connection string (postgresql://…)");

const schema = z.object({
  NODE_ENV: z.preprocess(
    blankToUndefined,
    z.enum(["development", "test", "production"]).default("development"),
  ),
  APP_ENV: z.preprocess(
    blankToUndefined,
    z.enum(["development", "test", "preview", "production"]).optional(),
  ),

  // Set by Vercel itself; never configure these by hand.
  VERCEL_ENV: z.preprocess(
    blankToUndefined,
    z.enum(["development", "preview", "production"]).optional(),
  ),
  VERCEL_URL: optionalString,
  VERCEL_PROJECT_PRODUCTION_URL: optionalString,

  DATABASE_URL: z.preprocess(blankToUndefined, postgresUrl),
  DATABASE_URL_UNPOOLED: z.preprocess(blankToUndefined, postgresUrl.optional()),

  BETTER_AUTH_SECRET: z.preprocess(
    blankToUndefined,
    z.string().min(32, "must be at least 32 characters long"),
  ),
  BETTER_AUTH_URL: z.preprocess(blankToUndefined, z.url().optional()),
  GOOGLE_CLIENT_ID: z.preprocess(blankToUndefined, z.string().min(1, "is required")),
  GOOGLE_CLIENT_SECRET: z.preprocess(blankToUndefined, z.string().min(1, "is required")),
  ALLOWED_EMAILS: z.preprocess(blankToUndefined, z.string().min(1, "is required")),

  ENABLE_TEST_LOGIN: z.preprocess(blankToUndefined, z.enum(["true", "false"]).default("false")),

  // AI provider (see docs/contracts/ai.md). "none" turns the AI off for the whole app.
  AI_PROVIDER: z.preprocess(
    blankToUndefined,
    z.enum(["none", "groq", "mistral", "openrouter", "standin"]).default("none"),
  ),
  AI_API_KEY: optionalString,
  AI_MODEL: optionalString,
  AI_DAILY_REQUEST_LIMIT: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(0).max(10_000).default(30),
  ),

  // Nudges and web push (see docs/contracts/nudges.md). Every one is optional: without them
  // the app runs and nudges simply do not go out.
  NUDGE_TICK_SECRET: z.preprocess(
    blankToUndefined,
    z.string().min(32, "must be at least 32 characters long").optional(),
  ),
  NUDGE_TEST_CLOCK: z.preprocess(blankToUndefined, z.enum(["true", "false"]).default("false")),
  VAPID_PUBLIC_KEY: optionalString,
  VAPID_PRIVATE_KEY: optionalString,
  VAPID_SUBJECT: optionalString,
});

export type AppEnvironment = "development" | "test" | "preview" | "production";

export interface Env {
  /** What kind of deployment this is. `production` always wins on Vercel. */
  appEnv: AppEnvironment;
  isProduction: boolean;
  databaseUrl: string;
  databaseUrlUnpooled: string | undefined;
  authSecret: string;
  /** Public origin of the app, no trailing slash. */
  baseUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  /** Lower-cased emails allowed to sign in. */
  allowedEmails: ReadonlySet<string>;
  /** True only when the explicit flag is on AND the deployment is not production. */
  testLoginEnabled: boolean;
  /** Which AI provider is used. "none" = AI off; "standin" = scripted test mode (never in production). */
  aiProvider: "none" | "groq" | "mistral" | "openrouter" | "standin";
  aiApiKey: string | undefined;
  aiModel: string | undefined;
  /** Per person, per calendar day in their time zone. */
  aiDailyRequestLimit: number;
  /** Shared secret the scheduler sends to the tick endpoint. Unset = the tick endpoint does not exist. */
  nudgeTickSecret: string | undefined;
  /**
   * Lets the tick endpoint accept an "as of" time, for tests. True only when the flag is on AND
   * the deployment is not production. Re-checked on every request (see nudgeTestClockAllowed).
   */
  nudgeTestClock: boolean;
  /** Web push keys. Null unless all three are set. */
  vapid: { publicKey: string; privateKey: string; subject: string } | null;
}

const APP_ENVIRONMENTS = ["development", "test", "preview", "production"] as const;

/**
 * Works out what kind of deployment this is, from raw environment values.
 *
 *   1. On Vercel production the answer is always "production"; nothing can override it.
 *   2. Otherwise an explicit APP_ENV wins (an unknown value is treated as production,
 *      the safe direction).
 *   3. Otherwise VERCEL_ENV, then NODE_ENV (`next start` / `next build` => production).
 *
 * Exported so the test-login guard can re-check at request time, independently of
 * the value computed at startup.
 */
export function detectAppEnv(
  source: Record<string, string | undefined> = process.env,
): AppEnvironment {
  if (source.VERCEL_ENV === "production") return "production";
  const explicit = source.APP_ENV?.trim();
  if (explicit) {
    return (APP_ENVIRONMENTS as readonly string[]).includes(explicit)
      ? (explicit as AppEnvironment)
      : "production";
  }
  if (source.VERCEL_ENV === "preview" || source.VERCEL_ENV === "development") {
    return source.VERCEL_ENV;
  }
  return source.NODE_ENV === "production" ? "production" : "development";
}

/**
 * Re-checks, on every request, whether the tick endpoint may accept an "as of" time. It reads
 * the raw environment, independently of the startup value, so a misconfiguration cannot slip
 * through. Same three-guard idea as the test-only login (docs/contracts/foundation.md, section 9).
 */
export function nudgeTestClockAllowed(source: Record<string, string | undefined> = process.env) {
  return source.NUDGE_TEST_CLOCK?.trim() === "true" && detectAppEnv(source) !== "production";
}

function resolveBaseUrl(parsed: z.infer<typeof schema>, appEnv: AppEnvironment): string | null {
  if (parsed.BETTER_AUTH_URL) return parsed.BETTER_AUTH_URL.replace(/\/+$/, "");
  if (appEnv === "production" && parsed.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${parsed.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (parsed.VERCEL_URL) return `https://${parsed.VERCEL_URL}`;
  if (appEnv !== "production") return "http://localhost:3000";
  return null;
}

function fail(problems: string[]): never {
  const message = [
    "FlowZone cannot start: the environment is not configured correctly.",
    ...problems.map((problem) => `  - ${problem}`),
    "See .env.example for what each variable means. (Values are never printed.)",
  ].join("\n");
  throw new Error(message);
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    fail(
      result.error.issues.map((issue) => {
        const name = issue.path.join(".") || "(root)";
        // Zod's "received undefined" wording is unfriendly for a missing variable.
        const missing =
          issue.code === "invalid_type" && issue.message.includes("received undefined");
        return `${name}: ${missing ? "is required but missing" : issue.message}`;
      }),
    );
  }
  const parsed = result.data;
  const problems: string[] = [];

  const appEnv = detectAppEnv({
    NODE_ENV: parsed.NODE_ENV,
    APP_ENV: parsed.APP_ENV,
    VERCEL_ENV: parsed.VERCEL_ENV,
  });

  const allowedEmails = new Set(
    parsed.ALLOWED_EMAILS.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  if (allowedEmails.size === 0) {
    problems.push("ALLOWED_EMAILS: must list at least one email address");
  }
  for (const email of allowedEmails) {
    if (!z.email().safeParse(email).success) {
      problems.push("ALLOWED_EMAILS: contains an entry that is not a valid email address");
      break;
    }
  }

  const baseUrl = resolveBaseUrl(parsed, appEnv);
  if (!baseUrl) {
    problems.push("BETTER_AUTH_URL: is required in production (for example https://your-domain)");
  } else if (appEnv === "production" && !baseUrl.startsWith("https://")) {
    problems.push("BETTER_AUTH_URL: must start with https:// in production");
  }

  const testLoginRequested = parsed.ENABLE_TEST_LOGIN === "true";
  if (testLoginRequested && appEnv === "production") {
    problems.push(
      "ENABLE_TEST_LOGIN: must not be enabled in production. Remove it from this environment.",
    );
  }

  const realProvider =
    parsed.AI_PROVIDER === "groq" ||
    parsed.AI_PROVIDER === "mistral" ||
    parsed.AI_PROVIDER === "openrouter";
  if (parsed.AI_PROVIDER === "standin" && appEnv === "production") {
    problems.push("AI_PROVIDER: standin (scripted test mode) must not be used in production.");
  }
  if (realProvider && !parsed.AI_API_KEY) {
    problems.push(`AI_PROVIDER: ${parsed.AI_PROVIDER} needs AI_API_KEY to be set.`);
  }

  const testClockRequested = parsed.NUDGE_TEST_CLOCK === "true";
  if (testClockRequested && appEnv === "production") {
    problems.push(
      "NUDGE_TEST_CLOCK: must not be enabled in production. Remove it from this environment.",
    );
  }

  const vapidKeys = [parsed.VAPID_PUBLIC_KEY, parsed.VAPID_PRIVATE_KEY, parsed.VAPID_SUBJECT];
  const vapidSet = vapidKeys.filter((value) => value !== undefined).length;
  if (vapidSet > 0 && vapidSet < 3) {
    problems.push(
      "VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must be set together, or all left blank.",
    );
  }
  if (parsed.VAPID_SUBJECT && !/^(mailto:|https:\/\/)/.test(parsed.VAPID_SUBJECT)) {
    problems.push("VAPID_SUBJECT: must start with mailto: or https://");
  }

  if (problems.length > 0) fail(problems);

  return {
    appEnv,
    isProduction: appEnv === "production",
    databaseUrl: parsed.DATABASE_URL,
    databaseUrlUnpooled: parsed.DATABASE_URL_UNPOOLED,
    authSecret: parsed.BETTER_AUTH_SECRET,
    baseUrl: baseUrl as string,
    googleClientId: parsed.GOOGLE_CLIENT_ID,
    googleClientSecret: parsed.GOOGLE_CLIENT_SECRET,
    allowedEmails,
    testLoginEnabled: testLoginRequested && appEnv !== "production",
    aiProvider: parsed.AI_PROVIDER,
    aiApiKey: parsed.AI_API_KEY,
    aiModel: parsed.AI_MODEL,
    aiDailyRequestLimit: parsed.AI_DAILY_REQUEST_LIMIT,
    nudgeTickSecret: parsed.NUDGE_TICK_SECRET,
    nudgeTestClock: testClockRequested && appEnv !== "production",
    vapid:
      vapidSet === 3
        ? {
            publicKey: parsed.VAPID_PUBLIC_KEY as string,
            privateKey: parsed.VAPID_PRIVATE_KEY as string,
            subject: parsed.VAPID_SUBJECT as string,
          }
        : null,
  };
}

export const env: Env = loadEnv();
