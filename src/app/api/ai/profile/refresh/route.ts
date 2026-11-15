import { ok, userRoute } from "@/server/http/route";
import { createServiceContext } from "@/services/context";
import { refreshProfileSuggestions } from "@/services/ai/profile";

/** Asks for fresh suggestions. They arrive as proposals; nothing accepted is changed. */
export const POST = userRoute(async ({ user }) => {
  const ctx = await createServiceContext(user);
  return ok(await refreshProfileSuggestions(ctx));
});
