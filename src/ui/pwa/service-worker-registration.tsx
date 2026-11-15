"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (public/sw.js). Only in production builds: during development,
 * a cached script would hide the code being changed. The worker itself never caches /api.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}
