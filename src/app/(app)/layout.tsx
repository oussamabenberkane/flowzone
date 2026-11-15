import { Suspense, type ReactNode } from "react";
import { requirePageUser } from "@/server/auth/current-user";
import { AppShell } from "@/ui/shell/app-shell";
import { LoadingLine } from "@/ui/primitives";

/**
 * Every signed-in screen. The session is checked here (requirePageUser redirects to sign-in when
 * nobody is signed in) inside a Suspense boundary, as Cache Components requires for request data.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="fz-main">
          <LoadingLine label="Opening FlowZone…" />
        </div>
      }
    >
      <Gate>{children}</Gate>
    </Suspense>
  );
}

async function Gate({ children }: { children: ReactNode }) {
  await requirePageUser();
  return <AppShell>{children}</AppShell>;
}
