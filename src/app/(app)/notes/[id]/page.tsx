import { Suspense } from "react";
import { EntryForm } from "@/ui/notes/notes-screens";
import { LoadingLine } from "@/ui/primitives";

export default function EditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<LoadingLine />}>
      <Loaded params={params} />
    </Suspense>
  );
}

async function Loaded({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EntryForm entryId={id} start={{ kind: "note" }} />;
}
