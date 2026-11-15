import { ok, userRoute } from "@/server/http/route";
import { createServiceContext } from "@/services/context";
import { confirmAction } from "@/services/ai/actions";

/** The person confirms a pending action. It runs now and the result is logged. */
export const POST = userRoute<{ id: string }>(async ({ user, params }) => {
  const ctx = await createServiceContext(user);
  return ok({ action: await confirmAction(ctx, params.id) });
});
