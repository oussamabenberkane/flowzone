import { ok, readJson, userRoute } from "@/server/http/route";
import { captureBody } from "@/shared/ai-schemas";
import { createServiceContext } from "@/services/context";
import { parseCapture } from "@/services/ai/features";

/** Reads one capture line. Creates nothing. Falls back to the deterministic parser. */
export const POST = userRoute(async ({ req, user }) => {
  const body = await readJson(req, captureBody);
  const ctx = await createServiceContext(user);
  return ok(await parseCapture(ctx, body.text));
});
