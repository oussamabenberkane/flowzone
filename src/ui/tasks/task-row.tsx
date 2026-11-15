"use client";

/**
 * One task in a list: a leaf (the checkbox), the title, what it is about, and a gentle prompt
 * when a repeating task has been quiet for a while. Completing it lets the leaf drift away,
 * then sends the change; if the change is refused, the leaf comes back and the person is told.
 */
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import type { TaskView } from "@/shared/views";
import { messageFor } from "@/ui/api/client";
import { LeafCheck } from "@/ui/leaf";
import { useToast } from "@/ui/toast";
import { estimateLabel, whenLabel } from "@/ui/format";
import { completeNow, lessMotion, refreshTaskViews, reopenNow } from "./task-actions";

const DRIFT_MS = 420;

export function TaskRow({
  task,
  today,
  projectName,
  actions,
  readOnly = false,
  testId = "task-row",
}: {
  task: TaskView;
  today: string | null;
  projectName?: string | null;
  /** Extra controls on the right (for example reorder and remove in the day's plan). */
  actions?: ReactNode;
  /** True when showing a saved copy offline: the leaf can be seen but not changed. */
  readOnly?: boolean;
  testId?: string;
}) {
  const toast = useToast();
  const [drifting, setDrifting] = useState(false);
  const busy = useRef(false);
  const done = task.status === "completed";

  const meta = [
    whenLabel({ dueDate: task.dueDate, dueTime: task.dueTime, today }),
    projectName ?? null,
    estimateLabel(task.estimateMinutes),
    task.priority === "high" ? "High priority" : null,
  ].filter(Boolean);

  async function toggle() {
    if (busy.current) return;
    busy.current = true;

    if (done) {
      // Reopen: no drift, just bring it back.
      try {
        await reopenNow(task);
        await refreshTaskViews(task.id);
      } catch (error) {
        toast.show(messageFor(error), { tone: "problem" });
      } finally {
        busy.current = false;
      }
      return;
    }

    // Complete: the leaf drifts off the list, then the change is sent.
    if (!lessMotion()) {
      setDrifting(true);
      await new Promise((resolve) => window.setTimeout(resolve, DRIFT_MS));
    }
    try {
      await completeNow(task);
      await refreshTaskViews(task.id);
      // A repeating task moves on to its next occurrence, so there is nothing to undo.
      const undo = task.recurrence
        ? {}
        : {
            actionLabel: "Undo",
            onAction: () => {
              void reopenNow(task).then(() => refreshTaskViews(task.id));
            },
          };
      toast.show(task.recurrence ? "Done for this time." : "Done.", undo);
    } catch (error) {
      setDrifting(false);
      toast.show(messageFor(error), { tone: "problem" });
    } finally {
      busy.current = false;
    }
  }

  return (
    <li
      className={`fz-task${done ? " is-done" : ""}${drifting ? " is-drifting" : ""}`}
      data-testid={testId}
    >
      <LeafCheck
        title={task.title}
        status={task.status}
        onToggle={() => void toggle()}
        disabled={readOnly || task.recurrence?.paused === true}
        testId={`${testId}-check`}
      />
      <div className="fz-task-body">
        <Link href={`/tasks/${task.id}`}>{task.title}</Link>
        {meta.length > 0 ? <span className="fz-task-meta">{meta.join(", ")}</span> : null}
        {task.recurrence?.adjustSuggested ? (
          <span className="fz-task-note">
            This one has been quiet for a while. Adjust it or pause it?
          </span>
        ) : null}
        {task.recurrence?.paused ? <span className="fz-task-meta">Paused for now</span> : null}
      </div>
      {actions ? <div className="fz-task-actions">{actions}</div> : null}
    </li>
  );
}
