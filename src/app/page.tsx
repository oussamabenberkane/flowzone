import { Suspense } from "react";
import { requirePageUser } from "@/server/auth/current-user";
import { SignOutButton } from "@/ui/sign-out-button";

/**
 * PLACEHOLDER signed-in page. Proves sign-in works end to end by showing who is
 * signed in. Frontend Core replaces this with the real app.
 *
 * Reading the session uses request headers, so (with Cache Components on) it lives
 * in a component wrapped in <Suspense>; the shell around it renders instantly.
 */
export default function HomePage() {
  return (
    <main className="page">
      <div className="card">
        <h1>FlowZone</h1>
        <Suspense fallback={<p className="muted">One moment…</p>}>
          <SignedIn />
        </Suspense>
      </div>
    </main>
  );
}

async function SignedIn() {
  // Redirects to /sign-in when nobody is signed in.
  const user = await requirePageUser();
  return (
    <>
      <p className="muted">Signed in as</p>
      <p>
        <strong>{user.email}</strong>
      </p>
      <SignOutButton />
    </>
  );
}
