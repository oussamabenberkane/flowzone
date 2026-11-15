"use client";

/**
 * Quick add: the always-available box for capturing a task in plain language.
 *
 * - The text is read by the server's deterministic parser (POST /api/quick-add/parse). The
 *   result is shown as "what I understood", and every field can be corrected before saving.
 * - Saving creates the task with a client request id, so a retry cannot make a second one.
 * - Offline, the task is kept on this device and sent later (ui/offline/capture-queue.ts).
 * - "Today" is never decided here: dates come from the parser, which uses the person's time zone.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { ParsedField, QuickAddView, TaskPriority } from "@/shared/views";
import { isNetworkError, messageFor } from "@/ui/api/client";
import { createProject, createTask, listProjects, parseQuickAdd } from "@/ui/api/resources";
import { invalidate, useQuery } from "@/ui/data/query";
import { saveCapture } from "@/ui/offline/capture-queue";
import { useOnline } from "@/ui/offline/connection";
import { dayLabel, timeLabel } from "@/ui/format";
import { Button, ChoiceGroup, Notice, SelectField, Sheet, TextField } from "@/ui/primitives";
import { useToast } from "@/ui/toast";
import { ExtensionSlot } from "@/ui/extensions/slots";
import { CaptureHint } from "@/ui/ai/capture-hint";
import { useAi } from "@/ui/ai/use-ai";

const NEW_PROJECT_PREFIX = "__new__:";
const OFFLINE_SAVED = "Saved on this device. It will arrive when you're back online.";

interface QuickAddApi {
  open: (initialText?: string) => void;
}

const QuickAddContext = createContext<QuickAddApi | null>(null);

export function QuickAddProvider({
  children,
  today,
}: {
  children: ReactNode;
  today: string | null;
}) {
  const [state, setState] = useState({ open: false, initialText: "", key: 0 });

  const open = useCallback((initialText = "") => {
    setState((current) => ({ open: true, initialText, key: current.key + 1 }));
  }, []);
  const close = useCallback(() => setState((current) => ({ ...current, open: false })), []);
  const api = useMemo(() => ({ open }), [open]);

  return (
    <QuickAddContext.Provider value={api}>
      {children}
      <Sheet open={state.open} onClose={close} title="Capture" testId="quick-add-sheet">
        <QuickAddForm
          key={state.key}
          initialText={state.initialText}
          today={today}
          onDone={close}
        />
      </Sheet>
    </QuickAddContext.Provider>
  );
}

export function useQuickAdd(): QuickAddApi {
  const api = useContext(QuickAddContext);
  if (!api) throw new Error("useQuickAdd must be used inside QuickAddProvider");
  return api;
}

const UNDERSTOOD_LABEL: Record<ParsedField["field"], string> = {
  title: "Title",
  dueDate: "Date",
  dueTime: "Time",
  project: "Project",
  priority: "Priority",
};

/** What the person changed by hand. Anything not changed follows the parser. */
interface Overrides {
  title?: string;
  dueDate?: string;
  dueTime?: string;
  priority?: TaskPriority;
  project?: string;
}

function QuickAddForm({
  initialText,
  today,
  onDone,
}: {
  initialText: string;
  today: string | null;
  onDone: () => void;
}) {
  const online = useOnline();
  const toast = useToast();
  const ai = useAi();
  const projects = useQuery("projects", listProjects);
  const [text, setText] = useState(initialText);
  const [parsed, setParsed] = useState<QuickAddView | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // One id per capture. Retries reuse it, so a repeated tap cannot create a second task.
  const [requestId] = useState(() => crypto.randomUUID());

  // Ask the parser, a moment after the person stops typing. Only when a connection exists.
  useEffect(() => {
    if (!text.trim() || !online) return;
    const timer = window.setTimeout(() => {
      parseQuickAdd({ text: text.trim() })
        .then(setParsed)
        .catch(() => setParsed(null));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [text, online]);

  const hasText = text.trim().length > 0;
  // The parser's answer only counts while it matches the text on screen and a connection exists.
  const live = hasText && online ? parsed : null;
  const title = overrides.title ?? (live?.title || text.trim());
  const dueDate = overrides.dueDate ?? live?.dueDate ?? "";
  const dueTime = overrides.dueTime ?? live?.dueTime ?? "";
  const priority: TaskPriority = overrides.priority ?? live?.priority ?? "normal";

  const projectList = projects.data?.projects ?? [];
  const suggestedProject = live?.projectId
    ? live.projectId
    : live?.projectName
      ? `${NEW_PROJECT_PREFIX}${live.projectName}`
      : "";
  const projectChoice = overrides.project ?? suggestedProject;
  const creatingProject = projectChoice.startsWith(NEW_PROJECT_PREFIX);
  const projectName = creatingProject
    ? projectChoice.slice(NEW_PROJECT_PREFIX.length)
    : (projectList.find((p) => p.id === projectChoice)?.name ?? null);

  const canSave = hasText && title.trim().length > 0 && !busy;
  const understood = live?.understood ?? [];

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setProblem(null);
    setBusy(true);

    const fields = {
      title: title.trim(),
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      priority,
    };

    try {
      if (!online) {
        // Plain typed text with no corrections is read by the server when it syncs.
        const untouched = Object.keys(overrides).length === 0;
        await saveCapture(
          untouched
            ? { text: text.trim() }
            : { fields: { ...fields, projectId: creatingProject ? null : projectChoice || null } },
        );
        toast.show(OFFLINE_SAVED);
        onDone();
        return;
      }

      let projectId: string | null = creatingProject ? null : projectChoice || null;
      if (creatingProject) {
        const project = await createProject({
          name: projectName ?? "Project",
          clientRequestId: `${requestId}-project`,
        });
        projectId = project.id;
      }
      await createTask({ ...fields, projectId, clientRequestId: requestId });
      await invalidate("inbox", "today", "tasks", "fresh-look", "projects");
      toast.show(projectName ? `Added to ${projectName}` : "Added to your Inbox");
      onDone();
    } catch (error) {
      if (isNetworkError(error)) {
        // The connection dropped mid-save. Keep the task on this device rather than lose it.
        // The same request id as the attempt: if the server did get it, the queued copy finds that task.
        await saveCapture({
          fields: { ...fields, projectId: creatingProject ? null : projectChoice || null },
          clientRequestId: requestId,
        }).catch(() => undefined);
        toast.show(OFFLINE_SAVED);
        onDone();
      } else {
        setProblem(messageFor(error));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="fz-sheet-body" onSubmit={save} data-testid="quick-add-form">
      <TextField
        label="What's on your mind?"
        hint="For example: Call Sam tomorrow at 5pm #Work !high"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOverrides({});
        }}
        autoFocus
        autoComplete="off"
        maxLength={500}
        data-testid="quick-add-input"
      />

      {!online ? (
        <Notice>
          You&apos;re offline. The task will be kept on this device and sent when you&apos;re back
          online.
        </Notice>
      ) : null}

      {understood.length > 0 ? (
        <div className="fz-stack" data-testid="quick-add-understood">
          <h3>What I understood</h3>
          <ul className="fz-list" style={{ fontSize: "var(--text-sm)" }}>
            {understood.map((item) => (
              <li key={`${item.field}-${item.text}`}>
                {UNDERSTOOD_LABEL[item.field]}: {describe(item.field, item.value, today)}{" "}
                {item.text ? <span className="fz-muted">(from “{item.text}”)</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ExtensionSlot name="quick-add-assist" fallback={null}>
        {ai.features && hasText && online ? (
          <CaptureHint
            key={text.trim()}
            text={text.trim()}
            today={today}
            onUse={(parsedByAi) => {
              // The AI reading fills the fields as a set; the person still corrects anything.
              const named = parsedByAi.projectName?.trim().toLowerCase();
              const existing = named
                ? projectList.find((project) => project.name.toLowerCase() === named)
                : undefined;
              const project =
                parsedByAi.projectId ??
                existing?.id ??
                (parsedByAi.projectName ? `${NEW_PROJECT_PREFIX}${parsedByAi.projectName}` : "");
              setOverrides({
                title: parsedByAi.title,
                dueDate: parsedByAi.dueDate ?? "",
                dueTime: parsedByAi.dueTime ?? "",
                priority: parsedByAi.priority ?? "normal",
                project,
              });
            }}
          />
        ) : undefined}
      </ExtensionSlot>

      {hasText ? (
        <>
          <div className="fz-two">
            <TextField
              label="Title"
              value={title}
              maxLength={500}
              onChange={(event) => setOverrides((o) => ({ ...o, title: event.target.value }))}
              data-testid="quick-add-title"
            />
            <SelectField
              label="Project"
              value={projectChoice}
              onChange={(event) => setOverrides((o) => ({ ...o, project: event.target.value }))}
              data-testid="quick-add-project"
            >
              <option value="">No project (Inbox)</option>
              {projectList.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
              {creatingProject ? (
                <option value={projectChoice}>New project: {projectName}</option>
              ) : null}
            </SelectField>
            <TextField
              label="Date"
              type="date"
              value={dueDate}
              onChange={(event) => setOverrides((o) => ({ ...o, dueDate: event.target.value }))}
              data-testid="quick-add-date"
            />
            <TextField
              label="Time"
              type="time"
              value={dueTime}
              disabled={!dueDate}
              hint={dueDate ? undefined : "Choose a date to set a time."}
              onChange={(event) => setOverrides((o) => ({ ...o, dueTime: event.target.value }))}
              data-testid="quick-add-time"
            />
          </div>

          <ChoiceGroup<TaskPriority>
            legend="Priority"
            name="quick-add-priority"
            value={priority}
            testId="quick-add-priority"
            options={[
              { value: "low", label: "Low" },
              { value: "normal", label: "Normal" },
              { value: "high", label: "High" },
            ]}
            onChange={(value) => setOverrides((o) => ({ ...o, priority: value }))}
          />

          <p className="fz-muted" style={{ fontSize: "var(--text-sm)" }}>
            {projectName ? `It will be in ${projectName}.` : "It will be in your Inbox."}
          </p>
        </>
      ) : null}

      {problem ? <Notice role="alert">{problem}</Notice> : null}

      <div className="fz-sheet-foot">
        <Button variant="quiet" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSave} data-testid="quick-add-save">
          {busy ? "Saving…" : online ? "Add task" : "Save on this device"}
        </Button>
      </div>
    </form>
  );
}

function describe(field: ParsedField["field"], value: string, today: string | null): string {
  if (field === "dueTime") return timeLabel(value);
  if (field === "dueDate") return today ? dayLabel(value, today) : value;
  return value;
}
