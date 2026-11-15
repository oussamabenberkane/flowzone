/*
 * Service worker modules: the registration point for push and notification behaviour.
 *
 * How to add one (no change to public/sw.js needed):
 *   1. Put the classic script in this folder, for example public/sw/modules/push-handler.js.
 *      It adds its own listeners at the top level, for example self.addEventListener("push", …).
 *   2. Add its path to FLOWZONE_SW_MODULES below.
 *
 * Scripts here run inside the service worker, so they cannot use the DOM or import app code.
 * Keep them small and do not log personal content.
 *
 * Contract: docs/contracts/design-system.md, extension point "service-worker-push-module".
 */
const FLOWZONE_SW_MODULES = ["/sw/modules/push-handler.js"];

for (const path of FLOWZONE_SW_MODULES) {
  importScripts(path);
}
