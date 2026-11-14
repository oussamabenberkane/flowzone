import "server-only";
import { z } from "zod";
import {
  type ErrorCode,
  type ValidationIssue,
  ERROR_STATUS,
  DEFAULT_ERROR_MESSAGE,
} from "@/shared/errors";

/**
 * Throw an `ApiError` anywhere inside a route handler wrapped with `publicRoute` /
 * `userRoute`; the wrapper turns it into the standard error response
 * (see src/shared/errors.ts and docs/contracts/foundation.md).
 *
 *   throw notFound();                       // 404, default friendly message
 *   throw notFound("That task is gone.");   // 404, custom friendly message
 *
 * The `message` is shown to people. Keep it calm, short and free of internals:
 * never put SQL, stack traces, ids of other people's data, or raw library errors in it.
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: ValidationIssue[];

  constructor(code: ErrorCode, message?: string, details?: ValidationIssue[]) {
    super(message ?? DEFAULT_ERROR_MESSAGE[code]);
    this.name = "ApiError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }
}

export const unauthenticated = (message?: string) => new ApiError("unauthenticated", message);
export const forbidden = (message?: string) => new ApiError("forbidden", message);
/** Also use this when a row exists but belongs to someone else: never reveal which. */
export const notFound = (message?: string) => new ApiError("not_found", message);
export const badRequest = (message?: string) => new ApiError("bad_request", message);
export const conflict = (message?: string) => new ApiError("conflict", message);
export const rateLimited = (message?: string) => new ApiError("rate_limited", message);
export const validationFailed = (details: ValidationIssue[], message?: string) =>
  new ApiError("validation_failed", message, details);

/** Turn a Zod error into the list of fields to fix. */
export function issuesFromZod(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    field: issue.path.map(String).join("."),
    message: issue.message,
  }));
}
