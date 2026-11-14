import { pingDatabase } from "@/server/db/raw";
import { ok, publicRoute } from "@/server/http/route";

/**
 * Health check: is the app up, and can it reach the database?
 *   200 { status: "ok",       checks: { app: "ok", database: "ok" } }
 *   503 { status: "degraded", checks: { app: "ok", database: "error" } }
 * Public on purpose and deliberately boring: no versions, no hostnames, no errors.
 */
export const GET = publicRoute(async () => {
  const database = (await pingDatabase()) ? "ok" : "error";
  return ok(
    { status: database === "ok" ? "ok" : "degraded", checks: { app: "ok", database } },
    { status: database === "ok" ? 200 : 503 },
  );
});
