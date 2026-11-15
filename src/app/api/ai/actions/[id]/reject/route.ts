import { ok, userRoute } from "@/server/http/route";
import { createServiceContext } from "@/services/context";
import { rejectAction } from "@/services/ai/actions";

/** The person rejects a pending action. Nothing changes. */
export const POST = userRoute<{ id: string }>(async ({ user, params }) => {
  const ctx = await createServiceContext(user);
  return ok({ action: await rejectAction(ctx, params.id) });
});
