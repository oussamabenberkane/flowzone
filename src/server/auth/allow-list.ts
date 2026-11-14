import "server-only";
import { TEST_USER_EMAIL_DOMAIN } from "@/shared/auth";
import { env } from "@/server/env";

/** True for the reserved addresses given to test users (see test-login.ts). */
export function isTestEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${TEST_USER_EMAIL_DOMAIN}`);
}

/**
 * The single "may this person use FlowZone?" decision. Sign-up is closed: only
 * emails in the ALLOWED_EMAILS environment variable get in. Test users are also
 * accepted, but only while test login is enabled (never in production).
 *
 * Used in three places so it cannot be bypassed:
 *   - when an account is created (a stranger can never get an account),
 *   - when a session is created (a person removed from the list cannot sign back in),
 *   - on every request (a removed person's existing session stops working).
 */
export function isEmailAllowed(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (env.allowedEmails.has(normalized)) return true;
  return env.testLoginEnabled && isTestEmail(normalized);
}
