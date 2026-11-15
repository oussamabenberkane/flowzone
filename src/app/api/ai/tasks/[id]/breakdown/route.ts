import { ok, userRoute } from "@/server/http/route";
import { createServiceContext } from "@/services/context";
import { breakDownWithAi } from "@/services/ai/features";

/** Splits a task into steps. The steps are logged and can be undone. */
export const POST = userRoute<{ id: string }>(async ({ user, params }) => {
  const ctx = await createServiceContext(user);
  return ok(await breakDownWithAi(ctx, params.id));
});
