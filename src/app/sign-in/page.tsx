import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getPageSession } from "@/server/auth/current-user";
import { SignInPanel } from "@/ui/sign-in-panel";

/** The signed-out front door. Looks like the rest of the app; behaves as Foundation defined. */
export default function SignInPage() {
  return (
    <main className="fz-signin">
      <div className="fz-signin-card">
        <h1>FlowZone</h1>
        <p>A calm place for your tasks. Sign in to see today&apos;s water.</p>
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
  if (state.status === "signed-in") redirect("/today");
  return null;
}
