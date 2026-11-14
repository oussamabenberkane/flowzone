"use client";

import { useState } from "react";
import { SIGN_IN_PATH } from "@/shared/auth";
import { authClient } from "./auth-client";

/** PLACEHOLDER sign-out button. */
export function SignOutButton() {
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    // A full navigation so every server-rendered page forgets the old session.
    window.location.assign(SIGN_IN_PATH);
  }

  return (
    <button type="button" className="button secondary" onClick={signOut} disabled={pending}>
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
