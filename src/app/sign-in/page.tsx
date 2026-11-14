import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getPageSession } from "@/server/auth/current-user";
import { SignInPanel } from "@/ui/sign-in-panel";

/** PLACEHOLDER signed-out page. Frontend Core replaces the look. */
export default function SignInPage() {
  return (
    <main className="page">
      <div className="card">
        <h1>FlowZone</h1>
        <p className="muted">Sign in to continue.</p>
        <Suspense fallback={null}>
          <SkipIfSignedIn />
          <SignInPanel />
        </Suspense>
      </div>
    </main>
  );
}

/** Someone who is already signed in has no reason to be here. */
async function SkipIfSignedIn() {
  const state = await getPageSession();
  if (state.status === "signed-in") redirect("/");
  return null;
}
