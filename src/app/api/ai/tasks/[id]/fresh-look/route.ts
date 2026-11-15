import { ok, userRoute } from "@/server/http/route";
import { createServiceContext } from "@/services/context";
import { freshLookHelp } from "@/services/ai/features";

/** Gentle options for a stale or past-date task. Nothing changes until the person picks one. */
export const POST = userRoute<{ id: string }>(async ({ user, params }) => {
  const ctx = await createServiceContext(user);
  return ok(await freshLookHelp(ctx, params.id));
});
