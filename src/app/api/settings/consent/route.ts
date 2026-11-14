import { updateConsentSchema } from "@/shared/api-schemas";
import { createServiceContext } from "@/services/context";
import { updateConsent } from "@/services/settings";
import { ok, readJson, userRoute } from "@/server/http/route";

/**
 * PATCH /api/settings/consent: set any of ai_features, ai_notes_journal, ai_profile, nudges.
 * Each switch records when it last changed. All switches start off.
 */
export const PATCH = userRoute(async ({ req, user }) => {
  const body = await readJson(req, updateConsentSchema);
  const ctx = await createServiceContext(user);
  return ok(await updateConsent(ctx, body));
});
