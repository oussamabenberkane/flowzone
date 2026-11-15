/**
 * The one place the interface talks to the REST API. Every call goes through `apiRequest`,
 * which:
 *   - sends and reads JSON, and never caches (the API says so too);
 *   - turns the standard error shape (docs/contracts/foundation.md, section 6) into an
 *     ApiRequestError with a code the screens can branch on, and a calm message to show;
 *   - tells a network failure apart from a server answer, so the offline features can wait;
 *   - sends a signed-out person to the sign-in page.
 *
 * Browser-safe: it imports types and constants from src/shared only.
 */
import { DEFAULT_ERROR_MESSAGE, type ErrorCode, type ValidationIssue } from "@/shared/errors";
import { SIGN_IN_PATH } from "@/shared/auth";

export type ApiErrorCode = ErrorCode | "network" | "unknown";

export class ApiRequestError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: ValidationIssue[];
  readonly traceId: string | null;

  constructor(options: {
    code: ApiErrorCode;
    status: number;
    message: string;
    details?: ValidationIssue[];
    traceId?: string | null;
  }) {
    super(options.message);
    this.name = "ApiRequestError";
    this.code = options.code;
    this.status = options.status;
    this.details = options.details ?? [];
    this.traceId = options.traceId ?? null;
  }
}

/** A calm sentence to show someone for any error, whatever its source. */
export const OFFLINE_MESSAGE =
  "You seem to be offline. Nothing is lost. We'll try again when you're back online.";

export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "network";
}

export function messageFor(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === "network") return OFFLINE_MESSAGE;
    if (error.code === "unknown") return DEFAULT_ERROR_MESSAGE.internal_error;
    return error.message;
  }
  return DEFAULT_ERROR_MESSAGE.internal_error;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export async function apiRequest<T>(
  method: Method,
  path: string,
  options: { body?: unknown; query?: Record<string, string | number | undefined> } = {},
): Promise<T> {
  const url = buildUrl(path, options.query);
  const init: RequestInit = {
    method,
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  };
  if (options.body !== undefined) {
    init.headers = { ...init.headers, "Content-Type": "application/json" };
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiRequestError({ code: "network", status: 0, message: OFFLINE_MESSAGE });
  }

  if (response.status === 204) return undefined as T;

  const payload = await readPayload(response);
  if (response.ok) return payload as T;

  if (response.status === 401 && typeof window !== "undefined") {
    // Signed out (or the session expired): the sign-in page is the only sensible place to be.
    window.location.assign(SIGN_IN_PATH);
  }
  throw toApiError(response.status, payload);
}

function buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function toApiError(status: number, payload: unknown): ApiRequestError {
  const body = payload as {
    error?: { code?: string; message?: string; details?: ValidationIssue[]; traceId?: string };
  } | null;
  const error = body?.error;
  if (error && typeof error.code === "string" && error.code in DEFAULT_ERROR_MESSAGE) {
    const code = error.code as ErrorCode;
    return new ApiRequestError({
      code,
      status,
      message: error.message ?? DEFAULT_ERROR_MESSAGE[code],
      details: error.details,
      traceId: error.traceId ?? null,
    });
  }
  return new ApiRequestError({
    code: "unknown",
    status,
    message: DEFAULT_ERROR_MESSAGE.internal_error,
  });
}

/** Short helpers so call sites read like the API table in docs/contracts/api.md. */
export const api = {
  get: <T>(path: string, query?: Record<string, string | number | undefined>) =>
    apiRequest<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>("POST", path, { body: body ?? {} }),
  put: <T>(path: string, body: unknown) => apiRequest<T>("PUT", path, { body }),
  patch: <T>(path: string, body: unknown) => apiRequest<T>("PATCH", path, { body }),
  delete: <T = void>(path: string) => apiRequest<T>("DELETE", path),
};
