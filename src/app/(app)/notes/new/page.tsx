import { Suspense } from "react";
import { EntryForm, type EntryFormStart } from "@/ui/notes/notes-screens";
import { LoadingLine } from "@/ui/primitives";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Starts a new note or journal entry. The entry point decides the framing: "kind" comes from the
 * link the person chose (a note, or a journal entry), and "taskId" and "date" pre-fill the form.
 */
export default function NewEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; taskId?: string; date?: string }>;
}) {
  return (
    <Suspense fallback={<LoadingLine />}>
      <Loaded searchParams={searchParams} />
    </Suspense>
  );
}

async function Loaded({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; taskId?: string; date?: string }>;
}) {
  const query = await searchParams;
  const start: EntryFormStart = {
    kind: query.kind === "journal" ? "journal" : "note",
    taskId: query.taskId && UUID.test(query.taskId) ? query.taskId : null,
    entryDate: query.date && DATE.test(query.date) ? query.date : null,
  };
  return <EntryForm entryId={null} start={start} />;
}
