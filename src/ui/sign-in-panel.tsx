"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { NOT_ALLOWED_ERROR_CODES, SIGN_IN_PATH } from "@/shared/auth";
import { authClient } from "./auth-client";

/** PLACEHOLDER sign-in UI. Frontend Core replaces the look; keep the behaviour. */
export function SignInPanel() {
  const errorCode = useSearchParams().get("error");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const notAllowed =
    errorCode !== null && (NOT_ALLOWED_ERROR_CODES as readonly string[]).includes(errorCode);
  const otherError = (errorCode !== null && !notAllowed) || failed;

  async function signIn() {
    setPending(true);
    setFailed(false);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: SIGN_IN_PATH,
    });
    // On success the browser is redirected to Google, so we only get here on a problem.
    if (error) {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <>
      {notAllowed && (
        <p className="notice" role="alert">
          That Google account isn&apos;t on the invite list yet. FlowZone is private for now. You
          can try a different Google account.
        </p>
      )}
      {otherError && !notAllowed && (
        <p className="notice" role="alert">
          We couldn&apos;t sign you in just now. Please try again in a moment.
        </p>
      )}
      <button type="button" className="button" onClick={signIn} disabled={pending}>
        {pending ? "Opening Google…" : "Continue with Google"}
      </button>
    </>
  );
}
