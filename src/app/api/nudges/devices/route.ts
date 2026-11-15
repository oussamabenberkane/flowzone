import { addDeviceBody } from "@/shared/nudges";
import { createServiceContext } from "@/services/context";
import { addDevice, listDevices } from "@/services/nudges/devices";
import { ok, readJson, userRoute } from "@/server/http/route";

/**
 * GET /api/nudges/devices: the devices that accept notifications, and the public key the browser
 * needs to subscribe. The endpoint and keys are never returned.
 *
 * POST /api/nudges/devices: register this browser. Needs the `nudges` switch on. The same endpoint
 * again updates the existing device, so it answers 200 either way.
 */
export const GET = userRoute(async ({ user }) => {
  const ctx = await createServiceContext(user);
  return ok(await listDevices(ctx));
});

export const POST = userRoute(async ({ req, user }) => {
  const body = await readJson(req, addDeviceBody);
  const ctx = await createServiceContext(user);
  return ok(await addDevice(ctx, body));
});
