import { ok, userRoute } from "@/server/http/route";
import { createServiceContext } from "@/services/context";
import { aiStatus } from "@/services/ai/status";

/** The AI's state for the interface: switches, whether it can run and why not, today's use. */
export const GET = userRoute(async ({ user }) => {
  const ctx = await createServiceContext(user);
  return ok(await aiStatus(ctx));
});
