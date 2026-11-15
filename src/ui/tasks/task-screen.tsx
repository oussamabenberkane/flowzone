"use client";

/**
 * A single task: its title, when, where, how it feels, its steps, its notes and the options
 * for a task that needs a fresh look. Edits are saved together with "Save changes", and each
 * save sends only the fields that changed, so untouched fields are never overwritten.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type {
  EnergyLevel,
  ProjectView,
  TaskDetailView,
  TaskPriority,
  TaskView,
} from "@/shared/views";
import type { UpdateTaskInput } from "@/ui/api/resources";
import { messageFor } from "@/ui/api/client";
import {
  createTask,
  deleteTask,
  getTask,
  listEntries,
  listProjects,
  updateTask,
} from "@/ui/api/resources";
import { useQuery } from "@/ui/data/query";
import { ExtensionSlot } from "@/ui/extensions/slots";
import { TaskNudgeControl } from "@/ui/nudges/task-nudge-control";
import { TaskAssist } from "@/ui/ai/task-assist";
import { useAi } from "@/ui/ai/use-ai";
import { FreshLookActions } from "@/ui/fresh-look/fresh-look-actions";
import { estimateLabel } from "@/ui/format";
import { LeafCheck } from "@/ui/leaf";
import { IconFocus, IconTrash } from "@/ui/icons";
import {
  Button,
  ChoiceGroup,
  EmptyState,
  IconButton,
  LoadingLine,
  Notice,
  SelectField,
  TextField,
} from "@/ui/primitives";
import { useToast } from "@/ui/toast";
import { useToday } from "@/ui/today/today-data";
import { completeNow, refreshTaskViews, reopenNow } from "./task-actions";
import {
  draftFrom,
  recurrenceInputFrom,
  RecurrenceEditor,
  type RepeatDraft,
} from "./recurrence-editor";

const ESTIMATES = [15, 30, 45, 60, 90, 120, 180, 240];
const NO_ENERGY = "none";

export function TaskScreen({ id }: { id: string }) {
  const task = useQuery(`task:${id}`, () => getTask(id));
  const projects = useQuery("projects", listProjects);

  if (!task.data) {
    if (task.status === "error") {
      return (
        <EmptyState
          title="We couldn't find that."
          action={
            <Link href="/inbox" className="fz-button fz-button--small">
              Back to the Inbox
            </Link>
          }
        >
          {messageFor(task.error)}
        </EmptyState>
      );
    }
    return <LoadingLine label="Opening the leaf…" />;
  }

  // Keyed by the saved version, so the form starts again from the server's copy after each save.
  return (
    <TaskEditor
      key={`${task.data.id}:${task.data.updatedAt}`}
      task={task.data}
      projects={projects.data?.projects ?? []}
    />
  );
}

interface Draft {
  title: string;
  started: boolean;
  projectId: string;
  date: string;
  time: string;
  priority: TaskPriority;
  energy: EnergyLevel | typeof NO_ENERGY;
  estimate: string;
  repeat: RepeatDraft;
}

function draftOf(task: TaskDetailView): Draft {
  return {
    title: task.title,
    started: task.status === "in_progress",
    projectId: task.projectId ?? "",
    date: task.dueDate ?? "",
    time: task.dueTime ?? "",
    priority: task.priority,
    energy: task.energy ?? NO_ENERGY,
    estimate: task.estimateMinutes === null ? "" : String(task.estimateMinutes),
    repeat: draftFrom(task.recurrence),
  };
}

/** Only the fields that differ from the saved task. An empty object means nothing to save. */
function changesFor(task: TaskDetailView, draft: Draft): UpdateTaskInput {
  const patch: UpdateTaskInput = {};
  const original = draftOf(task);
  const isSubtask = task.parentTaskId !== null;
  const completed = task.status === "completed";

  if (draft.title.trim() !== original.title && draft.title.trim().length > 0)
    patch.title = draft.title.trim();

  if (!completed && draft.started !== original.started)
    patch.status = draft.started ? "in_progress" : "pending";

  if (!isSubtask && draft.projectId !== original.projectId)
    patch.projectId = draft.projectId || null;

  const willRepeat = draft.repeat.kind !== "never";
  if (!willRepeat && draft.date !== original.date) patch.dueDate = draft.date || null;

  if (draft.time !== original.time) patch.dueTime = draft.time || null;
  if (draft.priority !== original.priority) patch.priority = draft.priority;
  if (draft.energy !== original.energy)
    patch.energy = draft.energy === NO_ENERGY ? null : draft.energy;

  const estimate = draft.estimate === "" ? null : Number(draft.estimate);
  if (estimate !== task.estimateMinutes) patch.estimateMinutes = estimate;

  if (
    !isSubtask &&
    JSON.stringify(recurrenceInputFrom(draft.repeat)) !==
      JSON.stringify(recurrenceInputFrom(original.repeat))
  ) {
    const next = recurrenceInputFrom(draft.repeat);
    patch.recurrence = next ?? null;
  }

  return patch;
}

function TaskEditor({ task, projects }: { task: TaskDetailView; projects: ProjectView[] }) {
  const router = useRouter();
  const toast = useToast();
  const today = useToday();
  const [draft, setDraft] = useState<Draft>(() => draftOf(task));
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const ai = useAi();
  const isSubtask = task.parentTaskId !== null;
  const completed = task.status === "completed";
  const repeating = task.recurrence !== null;

  const patch = useMemo(() => changesFor(task, draft), [task, draft]);
  const dirty = Object.keys(patch).length > 0;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  async function save() {
    if (!dirty) return;
    setSaving(true);
    setProblem(null);
    try {
      await updateTask(task.id, patch);
      await refreshTaskViews(task.id);
      toast.show("Saved.");
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setSaving(false);
    }
  }

  async function toggleDone() {
    setProblem(null);
    try {
      if (completed) await reopenNow(task);
      else await completeNow(task);
      await refreshTaskViews(task.id);
      toast.show(completed ? "Reopened." : repeating ? "Done for this time." : "Done.");
    } catch (error) {
      setProblem(messageFor(error));
    }
  }

  return (
    <div className="fz-stack" style={{ gap: "var(--space-5)" }}>
      <header className="fz-row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
        <LeafCheck
          title={task.title}
          status={task.status}
          onToggle={() => void toggleDone()}
          disabled={task.recurrence?.paused === true}
          testId="task-done"
        />
        <div style={{ minWidth: 0, flex: 1, paddingTop: "var(--space-2)" }}>
          <h1 style={{ fontSize: "var(--text-2xl)", overflowWrap: "anywhere" }}>{task.title}</h1>
          <p className="fz-muted" style={{ fontSize: "var(--text-sm)" }}>
            {completed
              ? "Done. Select the leaf to reopen it."
              : repeating
                ? task.recurrence?.paused
                  ? "Paused for now."
                  : `Next time: ${task.recurrence?.currentOccurrence ?? "not set"}`
                : isSubtask
                  ? "A step inside a larger task."
                  : (estimateLabel(task.estimateMinutes) ?? "Not dated yet.")}
          </p>
        </div>
      </header>

      {task.recurrence?.adjustSuggested ? (
        <Notice>
          This one has been quiet for a while. You can change how often it repeats, pause it, or
          leave it as it is.
        </Notice>
      ) : null}

      <div className="fz-row">
        <Link href={`/focus/${task.id}`} className="fz-button fz-button--small">
          <IconFocus aria-hidden="true" width={18} height={18} />
          Focus on this
        </Link>
        {!completed ? (
          <Button
            variant="line"
            small
            onClick={() => void toggleDone()}
            disabled={task.recurrence?.paused === true}
          >
            {repeating ? "Done for this time" : "Mark as done"}
          </Button>
        ) : null}
      </div>

      <ExtensionSlot name="task-detail-mute">
        <TaskNudgeControl taskId={task.id} />
      </ExtensionSlot>

      <section className="fz-stack" aria-labelledby="details-title">
        <h2 id="details-title">Details</h2>

        <TextField
          label="Title"
          value={draft.title}
          maxLength={500}
          onChange={(event) => set("title", event.target.value)}
          data-testid="task-title"
        />

        {!isSubtask ? (
          <SelectField
            label="Project"
            value={draft.projectId}
            onChange={(event) => set("projectId", event.target.value)}
          >
            <option value="">No project (Inbox)</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </SelectField>
        ) : null}

        {!repeating ? (
          <div className="fz-two">
            <TextField
              label="Date"
              type="date"
              value={draft.date}
              onChange={(event) => set("date", event.target.value)}
              data-testid="task-date"
            />
            <TextField
              label="Time"
              type="time"
              value={draft.time}
              disabled={!draft.date && !repeating}
              hint={draft.date ? undefined : "Choose a date to set a time."}
              onChange={(event) => set("time", event.target.value)}
              data-testid="task-time"
            />
          </div>
        ) : (
          <TextField
            label="Time"
            type="time"
            value={draft.time}
            onChange={(event) => set("time", event.target.value)}
            hint="The day comes from the repeat setting below."
            data-testid="task-time"
          />
        )}

        <ChoiceGroup<TaskPriority>
          legend="Priority"
          name="task-priority"
          testId="task-priority"
          value={draft.priority}
          onChange={(value) => set("priority", value)}
          options={[
            { value: "low", label: "Low" },
            { value: "normal", label: "Normal" },
            { value: "high", label: "High" },
          ]}
        />

        <ChoiceGroup<EnergyLevel | typeof NO_ENERGY>
          legend="Energy it needs"
          name="task-energy"
          testId="task-energy"
          value={draft.energy}
          onChange={(value) => set("energy", value)}
          options={[
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
            { value: NO_ENERGY, label: "Not set" },
          ]}
        />

        <SelectField
          label="How long it takes"
          value={draft.estimate}
          onChange={(event) => set("estimate", event.target.value)}
        >
          <option value="">Not set</option>
          {ESTIMATES.map((minutes) => (
            <option key={minutes} value={minutes}>
              About {minutes < 60 ? `${minutes} min` : `${minutes / 60} h`}
            </option>
          ))}
          {draft.estimate !== "" && !ESTIMATES.includes(Number(draft.estimate)) ? (
            <option value={draft.estimate}>About {draft.estimate} min</option>
          ) : null}
        </SelectField>

        {!isSubtask ? (
          <RecurrenceEditor
            draft={draft.repeat}
            onChange={(next) => set("repeat", next)}
            allowPause={repeating || draft.repeat.kind !== "never"}
          />
        ) : null}
      </section>

      {!isSubtask ? <StepsSection task={task} /> : null}
      <NotesSection taskId={task.id} />

      {problem ? <Notice role="alert">{problem}</Notice> : null}

      <div className="fz-row" style={{ justifyContent: "space-between" }}>
        <Button onClick={() => void save()} disabled={!dirty || saving} data-testid="task-save">
          {saving ? "Saving…" : "Save changes"}
        </Button>
        {dirty ? (
          <span className="fz-muted" style={{ fontSize: "var(--text-sm)" }}>
            Not saved yet.
          </span>
        ) : null}
      </div>

      {!completed ? (
        <details className="fz-card" data-testid="task-options">
          <summary
            style={{
              fontWeight: 700,
              minHeight: "var(--touch)",
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            Other options
          </summary>
          <div style={{ marginTop: "var(--space-3)" }}>
            <FreshLookActions task={task} today={today} onDone={() => router.push("/inbox")} />
          </div>
        </details>
      ) : null}

      <ExtensionSlot name="task-assist" fallback={null}>
        {ai.features ? (
          <TaskAssist taskId={task.id} label="Break it into steps" testId="detail-task-assist" />
        ) : undefined}
      </ExtensionSlot>

      <DeleteTask
        taskId={task.id}
        onDeleted={() => router.push("/inbox")}
        confirming={confirmingDelete}
        setConfirming={setConfirmingDelete}
      />
    </div>
  );
}

function StepsSection({ task }: { task: TaskDetailView }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  async function addStep() {
    const value = title.trim();
    if (!value) return;
    setBusy(true);
    try {
      await createTask({ title: value, parentTaskId: task.id, clientRequestId: requestId });
      setTitle("");
      setRequestId(crypto.randomUUID());
      await refreshTaskViews(task.id);
    } catch (error) {
      toast.show(messageFor(error), { tone: "problem" });
    } finally {
      setBusy(false);
    }
  }

  async function toggleStep(step: TaskView) {
    try {
      if (step.status === "completed") await reopenNow(step);
      else await completeNow(step);
      await refreshTaskViews(task.id);
    } catch (error) {
      toast.show(messageFor(error), { tone: "problem" });
    }
  }

  async function removeStep(step: TaskView) {
    try {
      await deleteTask(step.id);
      await refreshTaskViews(task.id);
    } catch (error) {
      toast.show(messageFor(error), { tone: "problem" });
    }
  }

  return (
    <section className="fz-stack" aria-labelledby="steps-title" data-testid="task-steps">
      <h2 id="steps-title">Steps</h2>
      {task.subtasks.length === 0 ? (
        <p className="fz-muted">No steps yet. Small steps make it easier to start.</p>
      ) : (
        <ul className="fz-list">
          {task.subtasks.map((step) => (
            <li key={step.id} className={`fz-task${step.status === "completed" ? " is-done" : ""}`}>
              <LeafCheck
                title={step.title}
                status={step.status}
                onToggle={() => void toggleStep(step)}
                testId="step-check"
              />
              <div className="fz-task-body">
                <span>{step.title}</span>
              </div>
              <IconButton label={`Remove step ${step.title}`} onClick={() => void removeStep(step)}>
                <IconTrash />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <div className="fz-row" style={{ alignItems: "flex-end" }}>
        <TextField
          label="Add a step"
          value={title}
          maxLength={500}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void addStep();
            }
          }}
          data-testid="step-input"
        />
        <Button
          variant="line"
          onClick={() => void addStep()}
          disabled={busy || !title.trim()}
          data-testid="step-add"
        >
          Add step
        </Button>
      </div>
    </section>
  );
}

function NotesSection({ taskId }: { taskId: string }) {
  const notes = useQuery(`entries:task:${taskId}`, () => listEntries({ taskId, limit: 20 }));
  const entries = notes.data?.entries ?? [];

  return (
    <section className="fz-stack" aria-labelledby="task-notes-title" data-testid="task-notes">
      <div className="fz-row" style={{ justifyContent: "space-between" }}>
        <h2 id="task-notes-title">Notes about this</h2>
        <Link
          href={`/notes/new?taskId=${taskId}`}
          className="fz-button fz-button--line fz-button--small"
        >
          Add a note
        </Link>
      </div>
      {entries.length === 0 ? (
        <p className="fz-muted">
          Nothing written here yet. Parked thoughts from Focus also land here.
        </p>
      ) : (
        <ul className="fz-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Link href={`/notes/${entry.id}`} className="fz-link-row">
                <span style={{ fontWeight: 600 }}>
                  {entry.title || entry.body.slice(0, 60) || "Untitled"}
                </span>
                <span className="fz-task-meta">
                  {entry.kind === "journal" ? "Journal" : "Note"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DeleteTask({
  taskId,
  onDeleted,
  confirming,
  setConfirming,
}: {
  taskId: string;
  onDeleted: () => void;
  confirming: boolean;
  setConfirming: (value: boolean) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await deleteTask(taskId);
      await refreshTaskViews(taskId);
      toast.show("Deleted.");
      onDeleted();
    } catch (error) {
      toast.show(messageFor(error), { tone: "problem" });
      setBusy(false);
    }
  }

  return (
    <section className="fz-stack" aria-label="Delete">
      {confirming ? (
        <>
          <p>
            Delete this for good? Its steps and history go with it. Dropping it is the gentler
            choice.
          </p>
          <div className="fz-row">
            <Button onClick={() => void remove()} disabled={busy} data-testid="task-delete-confirm">
              Yes, delete it
            </Button>
            <Button variant="quiet" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button variant="quiet" onClick={() => setConfirming(true)} data-testid="task-delete">
            <IconTrash aria-hidden="true" width={18} height={18} />
            Delete this task
          </Button>
        </div>
      )}
    </section>
  );
}
