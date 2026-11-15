import { ok, userRoute } from "@/server/http/route";
import { createServiceContext } from "@/services/context";
import { acceptProfileItem } from "@/services/ai/profile";

/** The person accepts an assistant suggestion. */
export const POST = userRoute<{ id: string }>(async ({ user, params }) => {
  const ctx = await createServiceContext(user);
  return ok(await acceptProfileItem(ctx, params.id));
});
