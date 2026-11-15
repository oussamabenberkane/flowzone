import { ok, userRoute } from "@/server/http/route";
import { createServiceContext } from "@/services/context";
import { listPendingActions } from "@/services/ai/actions";

/** Actions waiting for one tap to confirm or reject. Expired ones are closed. */
export const GET = userRoute(async ({ user }) => {
  const ctx = await createServiceContext(user);
  return ok({ actions: await listPendingActions(ctx) });
});
