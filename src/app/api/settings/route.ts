import { updateSettingsSchema } from "@/shared/api-schemas";
import { createServiceContext } from "@/services/context";
import { getSettings, updateSettings } from "@/services/settings";
import { ok, readJson, userRoute } from "@/server/http/route";

/** GET /api/settings: time zone, quiet hours, first-run flag and the four consent switches. */
export const GET = userRoute(async ({ user }) => {
  const ctx = await createServiceContext(user);
  return ok(await getSettings(ctx));
});

/** PATCH /api/settings: change time zone, quiet hours or the first-run flag. */
export const PATCH = userRoute(async ({ req, user }) => {
  const body = await readJson(req, updateSettingsSchema);
  const ctx = await createServiceContext(user);
  return ok(await updateSettings(ctx, body));
});
