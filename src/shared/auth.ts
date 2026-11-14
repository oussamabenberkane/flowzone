/**
 * Auth constants that both the server and the lightweight route guard (proxy.ts)
 * need. Keep this file free of imports so it is safe everywhere.
 */

/** Prefix of every Better Auth cookie, for example `flowzone.session_token`. */
export const AUTH_COOKIE_PREFIX = "flowzone";

/**
 * Test users get an address on this reserved domain. The ".invalid" top-level
 * domain can never belong to a real Google account, so a test user can never
 * collide with, or be confused with, a real one.
 */
export const TEST_USER_EMAIL_DOMAIN = "test.flowzone.invalid";

/** Names a test user may have: lowercase letters, digits and dashes. */
export const TEST_USER_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** Where the sign-in page lives. */
export const SIGN_IN_PATH = "/sign-in";

/**
 * Error codes the sign-in page understands in `?error=`. Better Auth uses
 * several codes when it refuses a sign-in; all of the ones below mean
 * "this account is not allowed" from the person's point of view.
 */
export const NOT_ALLOWED_ERROR_CODES = [
  "not_allowed",
  "unable_to_create_user",
  "unable_to_create_session",
  "access_denied",
] as const;
