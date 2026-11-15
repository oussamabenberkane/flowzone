import { createdJson, ok, readJson, userRoute } from "@/server/http/route";
import { profileTextBody } from "@/shared/ai-schemas";
import { createServiceContext } from "@/services/context";
import { addProfileItemByHand, listProfile } from "@/services/ai/profile";

/** The profile items: the person's own notes and the assistant's proposals. Always readable. */
export const GET = userRoute(async ({ user }) => {
  const ctx = await createServiceContext(user);
  return ok({ items: await listProfile(ctx) });
});

/** The person adds a fact by hand. It is accepted at once. */
export const POST = userRoute(async ({ req, user }) => {
  const body = await readJson(req, profileTextBody);
  const ctx = await createServiceContext(user);
  return createdJson(await addProfileItemByHand(ctx, body.text));
});
