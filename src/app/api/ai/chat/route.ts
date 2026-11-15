import { ok, userRoute } from "@/server/http/route";
import { createServiceContext } from "@/services/context";
import { clearChatHistory, listChatHistory } from "@/services/ai/chat";

/** The chat thread, oldest first. Works with AI off. */
export const GET = userRoute(async ({ user }) => {
  const ctx = await createServiceContext(user);
  return ok({ messages: await listChatHistory(ctx) });
});

/** Clears the whole thread. The action log is kept. */
export const DELETE = userRoute(async ({ user }) => {
  const ctx = await createServiceContext(user);
  return ok({ cleared: await clearChatHistory(ctx) });
});
