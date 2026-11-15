"use client";

/**
 * Notes and journal: one kind of entry, two ways in. A note is for keeping something. A journal
 * entry is for how a day went. Both are the same record with a different kind, and both can be
 * linked to a task or a project.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { EntryKind, EntryView, ProjectView, TaskView } from "@/shared/views";
import { isNetworkError, messageFor } from "@/ui/api/client";
import { saveCapture } from "@/ui/offline/capture-queue";
import { useOnline } from "@/ui/offline/connection";
import {
  createEntry,
  deleteEntry,
  getEntry,
  listEntries,
  listProjects,
  listTasks,
  updateEntry,
} from "@/ui/api/resources";
import { invalidate, useQuery } from "@/ui/data/query";
import { dayLabel } from "@/ui/format";
import {
  Button,
  ChoiceGroup,
  EmptyState,
  LoadingLine,
  Notice,
  ScreenTitle,
  SelectField,
  TextAreaField,
  TextField,
} from "@/ui/primitives";
import { useToast } from "@/ui/toast";
import { useToday } from "@/ui/today/today-data";

type Filter = "all" | EntryKind;

export function NotesScreen() {
  const today = useToday();
  const [filter, setFilter] = useState<Filter>("all");
  const query = useQuery(`entries:list:${filter}`, () =>
    listEntries({ kind: filter === "all" ? undefined : filter, limit: 50 }),
  );
  const entries = query.data?.entries ?? [];

  return (
    <>
      <ScreenTitle title="Notes" detail="Keep things here. The journal is for how a day went." />

      <div className="fz-two" style={{ marginBottom: "var(--space-6)" }}>
        <Link
          href="/notes/new?kind=note"
          className="fz-card"
          style={{ textDecoration: "none", color: "var(--ink)" }}
          data-testid="new-note"
        >
          <span style={{ display: "block", fontWeight: 700 }}>New note</span>
          <span className="fz-muted" style={{ fontSize: "var(--text-sm)" }}>
            Jot something down. Tidy it later, or never.
          </span>
        </Link>
        <Link
          href="/notes/new?kind=journal"
          className="fz-card"
          style={{ textDecoration: "none", color: "var(--ink)" }}
          data-testid="new-journal"
        >
          <span style={{ display: "block", fontWeight: 700 }}>Journal entry</span>
          <span className="fz-muted" style={{ fontSize: "var(--text-sm)" }}>
            How did today go? A line or two is plenty.
          </span>
        </Link>
      </div>

      <ChoiceGroup<Filter>
        legend="Show"
        name="notes-filter"
        testId="notes-filter"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "note", label: "Notes" },
          { value: "journal", label: "Journal" },
        ]}
      />

      <div style={{ marginTop: "var(--space-5)" }}>
        {query.status === "loading" && !query.data ? <LoadingLine /> : null}
        {query.status === "error" ? <Notice role="alert">{messageFor(query.error)}</Notice> : null}
        {query.status === "ready" && entries.length === 0 ? (
          <EmptyState title="Nothing written yet.">
            Whatever is on your mind can go here.
          </EmptyState>
        ) : null}
        {entries.length > 0 ? (
          <ul className="fz-list" data-testid="notes-list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <Link href={`/notes/${entry.id}`} className="fz-link-row">
                  <span style={{ fontWeight: 600, overflowWrap: "anywhere" }}>
                    {entry.title || entry.body.split("\n")[0].slice(0, 80) || "Untitled"}
                  </span>
                  <span className="fz-task-meta">
                    {entry.kind === "journal" ? "Journal" : "Note"},{" "}
                    {dayLabel(entry.entryDate, today)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </>
  );
}

export interface EntryFormStart {
  kind: EntryKind;
  taskId?: string | null;
  projectId?: string | null;
  entryDate?: string | null;
}

/** Create a note or journal entry (mode "new"), or edit an existing one (mode "edit"). */
export function EntryForm({ entryId, start }: { entryId: string | null; start: EntryFormStart }) {
  const existing = useQuery(entryId ? `entry:${entryId}` : null, () => getEntry(entryId ?? ""));
  if (entryId && !existing.data) {
    if (existing.status === "error") {
      return (
        <EmptyState
          title="We couldn't find that."
          action={
            <Link href="/notes" className="fz-button fz-button--small">
              Back to notes
            </Link>
          }
        >
          {messageFor(existing.error)}
        </EmptyState>
      );
    }
    return <LoadingLine label="Opening it…" />;
  }
  return (
    <EntryEditor
      // A new entry is keyed by its entry point, so a second new entry started in the app (for
      // example a journal entry right after a note) never reuses the first one's form state
      // and request id, which the server would treat as a retry and silently drop.
      key={
        existing.data
          ? `${existing.data.id}:${existing.data.updatedAt}`
          : `new:${JSON.stringify(start)}`
      }
      entry={existing.data ?? null}
      start={start}
    />
  );
}

function EntryEditor({ entry, start }: { entry: EntryView | null; start: EntryFormStart }) {
  const router = useRouter();
  const toast = useToast();
  const today = useToday();
  const online = useOnline();
  const tasks = useQuery("tasks:open", () => listTasks({ status: "open", limit: 100 }));
  const projects = useQuery("projects", listProjects);
  const [requestId] = useState(() => crypto.randomUUID());

  const [kind, setKind] = useState<EntryKind>(entry?.kind ?? start.kind);
  const [title, setTitle] = useState(entry?.title ?? "");
  const [body, setBody] = useState(entry?.body ?? "");
  const [entryDate, setEntryDate] = useState(entry?.entryDate ?? start.entryDate ?? today ?? "");
  const [taskId, setTaskId] = useState(entry?.taskId ?? start.taskId ?? "");
  const [projectId, setProjectId] = useState(entry?.projectId ?? start.projectId ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isNew = entry === null;
  const isJournal = kind === "journal";
  const heading = isNew
    ? isJournal
      ? "New journal entry"
      : "New note"
    : isJournal
      ? "Journal entry"
      : "Note";
  const taskOptions: TaskView[] = tasks.data?.tasks ?? [];
  const projectOptions: ProjectView[] = projects.data?.projects ?? [];

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() && !body.trim()) {
      setProblem("Write a title or a few words first.");
      return;
    }
    setBusy(true);
    setProblem(null);
    const values = {
      kind,
      title: title.trim() || null,
      body: body.trim(),
      entryDate: entryDate || undefined,
      taskId: taskId || null,
      projectId: projectId || null,
    };
    // A new entry can wait on the device; an edit needs the server, so it says so and keeps the words.
    const canQueue = !entry;
    const destination = taskId ? `/tasks/${taskId}` : "/notes";
    if (!online && canQueue) {
      await keepOnDevice();
      return;
    }
    if (!online) {
      setBusy(false);
      setProblem("Editing needs a connection. Your words are still here, so nothing is lost.");
      return;
    }
    try {
      if (entry) {
        await updateEntry(entry.id, values);
      } else {
        await createEntry({ ...values, clientRequestId: requestId });
      }
      await invalidate("entries", "notes", "task:", "tasks:");
      toast.show("Saved.");
      router.push(destination);
    } catch (error) {
      if (isNetworkError(error) && canQueue) {
        await keepOnDevice();
        return;
      }
      setProblem(messageFor(error));
    } finally {
      setBusy(false);
    }

    async function keepOnDevice() {
      try {
        await saveCapture({ entry: values, clientRequestId: requestId });
        toast.show("Saved on this device. It will arrive when you're back online.");
        router.push(destination);
      } catch (error) {
        setProblem(messageFor(error));
      } finally {
        setBusy(false);
      }
    }
  }

  async function remove() {
    if (!entry) return;
    setBusy(true);
    try {
      await deleteEntry(entry.id);
      await invalidate("entries", "notes");
      toast.show("Deleted.");
      router.push("/notes");
    } catch (error) {
      setProblem(messageFor(error));
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="fz-stack"
      style={{ gap: "var(--space-5)" }}
      data-testid="entry-form"
    >
      <ScreenTitle title={heading} />

      <ChoiceGroup<EntryKind>
        legend="What is this?"
        name="entry-kind"
        testId="entry-kind"
        value={kind}
        onChange={setKind}
        options={[
          { value: "note", label: "A note" },
          { value: "journal", label: "Journal" },
        ]}
      />

      <TextField
        label="Title (optional)"
        value={title}
        maxLength={200}
        onChange={(event) => setTitle(event.target.value)}
        data-testid="entry-title"
      />
      <TextAreaField
        label={isJournal ? "How did it go?" : "Note"}
        hint={
          isJournal
            ? "A line or two is plenty. Or leave it for another day."
            : "Jot it down. You can tidy it later."
        }
        value={body}
        maxLength={20000}
        rows={isJournal ? 6 : 8}
        onChange={(event) => setBody(event.target.value)}
        data-testid="entry-body"
      />

      <div className="fz-two">
        <TextField
          label="Date"
          type="date"
          value={entryDate}
          onChange={(event) => setEntryDate(event.target.value)}
          data-testid="entry-date"
        />
        <SelectField
          label="About a task"
          value={taskId}
          onChange={(event) => setTaskId(event.target.value)}
        >
          <option value="">None</option>
          {taskOptions.map((task) => (
            <option key={task.id} value={task.id}>
              {task.title}
            </option>
          ))}
          {taskId && !taskOptions.some((task) => task.id === taskId) ? (
            <option value={taskId}>A linked task</option>
          ) : null}
        </SelectField>
      </div>

      <SelectField
        label="About a project"
        value={projectId}
        onChange={(event) => setProjectId(event.target.value)}
      >
        <option value="">None</option>
        {projectOptions.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </SelectField>

      {problem ? <Notice role="alert">{problem}</Notice> : null}

      <div className="fz-row" style={{ justifyContent: "space-between" }}>
        <Button type="submit" disabled={busy} data-testid="entry-save">
          {busy ? "Saving…" : "Save"}
        </Button>
        <Link href="/notes" className="fz-button fz-button--quiet">
          Cancel
        </Link>
      </div>

      {entry ? (
        <section className="fz-stack" aria-label="Delete">
          {confirmingDelete ? (
            <div className="fz-row">
              <Button
                onClick={() => void remove()}
                disabled={busy}
                data-testid="entry-delete-confirm"
              >
                Yes, delete it
              </Button>
              <Button variant="quiet" onClick={() => setConfirmingDelete(false)}>
                Keep it
              </Button>
            </div>
          ) : (
            <div>
              <Button
                variant="quiet"
                onClick={() => setConfirmingDelete(true)}
                data-testid="entry-delete"
              >
                Delete this
              </Button>
            </div>
          )}
        </section>
      ) : null}
    </form>
  );
}
