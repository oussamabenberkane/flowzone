/**
 * The standard API error shape. Shared by the server (which produces it) and the
 * UI (which reads it). Pure types and constants only: no server imports here.
 *
 * Every error response from our own API routes looks like this:
 *
 *   { "error": { "code": "not_found", "message": "We couldn't find that.", "traceId": "…" } }
 *
 * - `code` is a stable machine-readable string. Clients branch on it. Never rename it.
 * - `message` is human-friendly, calm, and safe to show. It never contains internals.
 * - `details` is only present for `validation_failed` and lists the fields to fix.
 * - `traceId` lets the owner match a user's report to a server log line.
 *
 * Better Auth's own endpoints under /api/auth/* use Better Auth's format, not this one.
 */

/** Machine code -> HTTP status. This table is the single source of truth. */
export const ERROR_STATUS = {
  /** No valid session. */
  unauthenticated: 401,
  /** Signed in, but not allowed (for example the email is no longer on the allow-list). */
  forbidden: 403,
  /** Does not exist, or belongs to someone else (we never reveal which). */
  not_found: 404,
  /** The request was well-formed but a field is wrong or missing. */
  validation_failed: 400,
  /** The request could not be understood (for example malformed JSON). */
  bad_request: 400,
  /** The request clashes with the current state of the data. */
  conflict: 409,
  /** Too many requests in a short time. */
  rate_limited: 429,
  /** Our fault. Details are logged on the server, never sent. */
  internal_error: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

/** Friendly default message for each code. Calm and blame-free by design. */
export const DEFAULT_ERROR_MESSAGE: Record<ErrorCode, string> = {
  unauthenticated: "Please sign in to continue.",
  forbidden: "You don't have access to that.",
  not_found: "We couldn't find that.",
  validation_failed: "A few details need another look.",
  bad_request: "That request didn't look quite right.",
  conflict: "That clashes with something that already exists.",
  rate_limited: "Let's slow down a little. Please try again in a moment.",
  internal_error: "Something went wrong on our side. Please try again.",
};

export interface ValidationIssue {
  /** Dotted path of the offending field, for example "title" or "steps.0.text". */
  field: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: ValidationIssue[];
    traceId: string;
  };
}

export function buildErrorBody(
  code: ErrorCode,
  traceId: string,
  options: { message?: string; details?: ValidationIssue[] } = {},
): ApiErrorBody {
  return {
    error: {
      code,
      message: options.message ?? DEFAULT_ERROR_MESSAGE[code],
      ...(options.details && options.details.length > 0 ? { details: options.details } : {}),
      traceId,
    },
  };
}
