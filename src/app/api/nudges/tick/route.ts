import { createHash, timingSafeEqual } from "node:crypto";
import { env, nudgeTestClockAllowed } from "@/server/env";
import { errorResponse, ok, publicRoute } from "@/server/http/route";
import { runNudgeTick } from "@/services/nudges/tick";

/**
 * POST /api/nudges/tick: called by the scheduler (GitHub Actions) every 30 minutes.
 * Contract: docs/contracts/nudges.md, sections 2 and 3.
 *
 * This is the one route that touches people's data without a signed-in session. It is therefore:
 *   - off unless NUDGE_TICK_SECRET is set (no secret configured = 404, the endpoint does not exist);
 *   - guarded by the shared secret in the `x-flowzone-tick-secret` header, compared in constant time;
 *   - safe to call twice in the same 30-minute window (the engine reserves each window once);
 *   - limited to the answer of counts: no ids, titles or content.
 *
 * `?asOf=<ISO time>` is a test-only clock. It is answered with 404 unless NUDGE_TEST_CLOCK is on and
 * the deployment is not production, checked on every request.
 *
 * It uses publicRoute because it has no session. Its own guards (above) come first.
 */
const SECRET_HEADER = "x-flowzone-tick-secret";

/** Compares two strings without leaking, through timing, how much of the secret matched. */
function secretMatches(presented: string, expected: string): boolean {
  if (presented.length === 0) return false;
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export const POST = publicRoute(async ({ req, traceId }) => {
  const secret = env.nudgeTickSecret;
  if (!secret) return errorResponse("not_found", traceId);

  if (!secretMatches(req.headers.get(SECRET_HEADER) ?? "", secret)) {
    return errorResponse("unauthenticated", traceId);
  }

  let asOf: Date | null = null;
  const asOfText = req.nextUrl.searchParams.get("asOf");
  if (asOfText !== null) {
    if (!nudgeTestClockAllowed()) return errorResponse("not_found", traceId);
    const parsed = Date.parse(asOfText);
    if (Number.isNaN(parsed)) {
      return errorResponse("validation_failed", traceId, {
        details: [
          { field: "asOf", message: "Use a full date and time, such as 2026-11-14T18:00:00Z." },
        ],
      });
    }
    asOf = new Date(parsed);
  }

  return ok(await runNudgeTick(asOf));
});
