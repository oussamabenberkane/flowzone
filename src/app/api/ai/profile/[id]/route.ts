import { noContent, ok, readJson, userRoute } from "@/server/http/route";
import { profileTextBody } from "@/shared/ai-schemas";
import { createServiceContext } from "@/services/context";
import { deleteProfileItem, editProfileItem } from "@/services/ai/profile";

/** The person edits the wording of an item. */
export const PATCH = userRoute<{ id: string }>(async ({ req, user, params }) => {
  const body = await readJson(req, profileTextBody);
  const ctx = await createServiceContext(user);
  return ok(await editProfileItem(ctx, params.id, body.text));
});

/** Deletes an item, or rejects a suggestion. */
export const DELETE = userRoute<{ id: string }>(async ({ user, params }) => {
  const ctx = await createServiceContext(user);
  await deleteProfileItem(ctx, params.id);
  return noContent();
});
