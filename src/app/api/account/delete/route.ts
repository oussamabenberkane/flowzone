import { deleteAccountBody } from "@/shared/api-schemas";
import { endSessionForResponse } from "@/server/auth/account";
import { createServiceContext } from "@/services/context";
import { deleteAccount } from "@/services/lifecycle/export-and-delete";
import { ok, readJson, userRoute } from "@/server/http/route";

/**
 * POST /api/account/delete with body {"confirm":"DELETE"}. Deletes every piece of the
 * person's data through the lifecycle registry, then their account, and signs them out.
 * Cannot be undone. Retrying after a partial failure is safe.
 */
export const POST = userRoute(async ({ req, user }) => {
  await readJson(req, deleteAccountBody);
  const ctx = await createServiceContext(user);
  // Sign out first, while the session still exists, so the response clears the cookies.
  const clearCookies = await endSessionForResponse(req.headers);
  await deleteAccount(ctx);
  const response = ok({ deleted: true });
  for (const cookie of clearCookies) response.headers.append("Set-Cookie", cookie);
  return response;
});
