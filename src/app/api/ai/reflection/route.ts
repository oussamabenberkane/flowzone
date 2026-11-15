import { ok, userRoute } from "@/server/http/route";
import { createServiceContext } from "@/services/context";
import { reflectionPrompt } from "@/services/ai/features";

/** The end-of-day reflection prompt. Always returns text: a plain fixed prompt when the AI cannot write one. */
export const POST = userRoute(async ({ user }) => {
  const ctx = await createServiceContext(user);
  return ok(await reflectionPrompt(ctx));
});
