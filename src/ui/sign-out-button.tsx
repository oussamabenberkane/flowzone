"use client";

import { useState } from "react";
import { SIGN_IN_PATH } from "@/shared/auth";
import { authClient } from "./auth-client";
import { clearDeviceCaptures, useCaptureQueue } from "./offline/capture-queue";
import { clearTodaySnapshots } from "./offline/snapshot";
import { Button, Notice } from "./primitives";

/**
 * Signs out and leaves nothing of this person on the device: the saved Today, the cached pages
 * and any captures not yet sent. If captures are waiting, it asks first, because removing them
 * loses them.
 */
export function SignOutButton() {
  const queue = useCaptureQueue();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const waiting = queue.items.length;

  async function signOut() {
    setBusy(true);
    await clearDeviceCaptures().catch(() => undefined);
    await clearTodaySnapshots();
    navigator.serviceWorker?.controller?.postMessage({ type: "FLOWZONE_CLEAR_PAGES" });
    await authClient.signOut().catch(() => undefined);
    // A full navigation, so every server-rendered page forgets the old session.
    window.location.assign(SIGN_IN_PATH);
  }

  if (asking) {
    return (
      <div className="fz-stack">
        <Notice>
          {waiting === 1 ? "One thing you saved" : `${waiting} things you saved`} on this device has
          not been sent yet. Signing out removes {waiting === 1 ? "it" : "them"} from this device.
        </Notice>
        <div className="fz-row">
          <Button onClick={() => void signOut()} disabled={busy} data-testid="sign-out-confirm">
            {busy ? "Signing out…" : "Sign out and remove them"}
          </Button>
          <Button variant="quiet" onClick={() => setAsking(false)}>
            Stay signed in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button
      variant="line"
      disabled={busy}
      onClick={() => (waiting > 0 ? setAsking(true) : void signOut())}
      data-testid="sign-out"
    >
      {busy ? "Signing out…" : "Sign out"}
    </Button>
  );
}
