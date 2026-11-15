import { ok, userRoute } from "@/server/http/route";
import { createServiceContext } from "@/services/context";
import { listActions } from "@/services/ai/actions";

/** Recent actions the AI took or proposed, newest first. */
export const GET = userRoute(async ({ user }) => {
  const ctx = await createServiceContext(user);
  return ok({ actions: await listActions(ctx, 50) });
});
