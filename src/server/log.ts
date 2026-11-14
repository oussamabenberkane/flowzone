import "server-only";

/**
 * Minimal, privacy-safe logging.
 *
 * RULES (also in docs/contracts/foundation.md):
 *   - Never log personal content: task text, notes, journal entries, chat
 *     messages, names, emails, or request bodies.
 *   - Log WHAT happened (an event name), WHERE (route), and a trace id. Nothing else.
 *   - Error messages from libraries can quote data (a database error may echo a
 *     value), so we never log `error.message`. We log the error's name, its
 *     machine code (for example a Postgres SQLSTATE), and the stack frames only.
 *   - No third-party analytics or tracking, anywhere.
 */

interface ErrorSummary {
  name: string;
  code?: string;
  constraint?: string;
  table?: string;
  frames?: string[];
}

function pickString(source: unknown, key: string): string | undefined {
  if (typeof source !== "object" || source === null) return undefined;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

/** Reduce an unknown thrown value to fields that are safe to log. */
export function describeError(error: unknown): ErrorSummary {
  if (typeof error !== "object" || error === null) return { name: typeof error };
  // Drizzle wraps the driver's error in `cause`; the driver error holds the SQLSTATE.
  const cause = (error as { cause?: unknown }).cause;
  const source = typeof cause === "object" && cause !== null ? cause : error;

  const stack = error instanceof Error ? error.stack : undefined;
  // The first line of a stack is "Name: message". Drop it; keep only the frames.
  const frames = stack
    ?.split("\n")
    .filter((line) => line.trimStart().startsWith("at "))
    .slice(0, 6)
    .map((line) => line.trim());

  return {
    name: error instanceof Error ? error.name : "NonError",
    code: pickString(source, "code") ?? pickString(error, "code"),
    constraint: pickString(source, "constraint"),
    table: pickString(source, "table"),
    frames,
  };
}

export function logError(
  event: string,
  error: unknown,
  context: { traceId?: string; route?: string } = {},
) {
  console.error(JSON.stringify({ level: "error", event, ...context, error: describeError(error) }));
}

export function logWarn(event: string, context: { traceId?: string; route?: string } = {}) {
  console.warn(JSON.stringify({ level: "warn", event, ...context }));
}

export function logInfo(event: string, context: { traceId?: string; route?: string } = {}) {
  console.info(JSON.stringify({ level: "info", event, ...context }));
}
