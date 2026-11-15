import { noContent, userRoute } from "@/server/http/route";
import { notFound } from "@/server/http/errors";
import { createServiceContext } from "@/services/context";
import { deleteChatMessage } from "@/services/ai/chat";

/** Deletes one message from the thread. */
export const DELETE = userRoute<{ id: string }>(async ({ user, params }) => {
  const ctx = await createServiceContext(user);
  if (!(await deleteChatMessage(ctx, params.id))) throw notFound();
  return noContent();
});
