import { createServiceContext } from "@/services/context";
import { removeDevice } from "@/services/nudges/devices";
import { uuidParam } from "@/server/http/params";
import { noContent, userRoute } from "@/server/http/route";

/** DELETE /api/nudges/devices/:id: stop sending to this device. Always allowed, even with nudges off. */
export const DELETE = userRoute<{ id: string }>(async ({ user, params }) => {
  const ctx = await createServiceContext(user);
  await removeDevice(ctx, uuidParam(params.id));
  return noContent();
});
