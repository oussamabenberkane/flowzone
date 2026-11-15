import { Suspense } from "react";
import { FocusScreen } from "@/ui/focus/focus-screen";
import { LoadingLine } from "@/ui/primitives";

export default function FocusPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<LoadingLine />}>
      <Loaded params={params} />
    </Suspense>
  );
}

async function Loaded({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FocusScreen id={id} />;
}
