import { updateEntrySchema } from "@/shared/api-schemas";
import { createServiceContext } from "@/services/context";
import { deleteEntry, getEntry, updateEntry } from "@/services/entries";
import { uuidParam } from "@/server/http/params";
import { noContent, ok, readJson, userRoute } from "@/server/http/route";

export const GET = userRoute<{ id: string }>(async ({ user, params }) => {
  const ctx = await createServiceContext(user);
  return ok(await getEntry(ctx, uuidParam(params.id)));
});

export const PATCH = userRoute<{ id: string }>(async ({ req, user, params }) => {
  const body = await readJson(req, updateEntrySchema);
  const ctx = await createServiceContext(user);
  return ok(await updateEntry(ctx, uuidParam(params.id), body));
});

export const DELETE = userRoute<{ id: string }>(async ({ user, params }) => {
  const ctx = await createServiceContext(user);
  await deleteEntry(ctx, uuidParam(params.id));
  return noContent();
});
