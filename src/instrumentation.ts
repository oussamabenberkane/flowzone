import type { Instrumentation } from "next";

/**
 * Runs once when the server starts.
 *  - `register` validates the environment up front so a bad configuration stops the
 *    app immediately and loudly, instead of failing on the first request.
 *  - `onRequestError` logs unexpected server errors safely (error type, code and stack
 *    frames only; never messages or content). See src/server/log.ts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/server/env");
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logError } = await import("@/server/log");
  logError("request.error", error, { route: context.routePath });
};
