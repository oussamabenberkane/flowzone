"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the browser believes it has a connection. It is a hint, not a guarantee: a request
 * can still fail while this says "online". The API client treats a failed request as the
 * real signal.
 */
function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

const getOnline = () => navigator.onLine;
const getServerOnline = () => true;

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getOnline, getServerOnline);
}
