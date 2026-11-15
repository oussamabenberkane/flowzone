import { ok, userRoute } from "@/server/http/route";
import { createServiceContext } from "@/services/context";
import { undoAction } from "@/services/ai/actions";

/** Reverses an applied action, using what was stored when it was applied. */
export const POST = userRoute<{ id: string }>(async ({ user, params }) => {
  const ctx = await createServiceContext(user);
  return ok({ action: await undoAction(ctx, params.id) });
});
