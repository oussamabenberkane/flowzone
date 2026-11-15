"use client";

/**
 * The manual options for a task that needs a fresh look: reschedule, break down, snooze, let go.
 * Shared by the eddy on Today and by the task detail page, so the words and the behaviour match.
 * Nothing here is automatic. Each option is a deliberate choice the person makes.
 */
import { useState } from "react";
import { addDays } from "@/shared/calendar";
import type { TaskView } from "@/shared/views";
import { messageFor } from "@/ui/api/client";
import { breakDownTask, dropTask, rescheduleTask, snoozeTask } from "@/ui/api/resources";
import { Button, TextAreaField, TextField } from "@/ui/primitives";
import { useToast } from "@/ui/toast";
import { refreshTaskViews } from "@/ui/tasks/task-actions";

const MAX_STEPS = 10;

export function FreshLookActions({
  task,
  today,
  onDone,
}: {
  task: TaskView;
  today: string | null;
  /** Called after an action that moves the task out of the place it was shown. */
  onDone?: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [steps, setSteps] = useState("");
  const [dropping, setDropping] = useState(false);
  const isRepeating = task.recurrence !== null;

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      await refreshTaskViews(task.id);
      toast.show(message);
      onDone?.();
    } catch (error) {
      toast.show(messageFor(error), { tone: "problem" });
    } finally {
      setBusy(false);
    }
  }

  const stepTitles = steps
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <section
      className="fz-stack"
      aria-labelledby={`fresh-${task.id}`}
      data-testid="fresh-look-actions"
    >
      <h3 id={`fresh-${task.id}`}>Options for this one</h3>

      <div className="fz-stack">
        <p className="fz-muted" style={{ fontSize: "var(--text-sm)" }}>
          Move it to a new day
        </p>
        {isRepeating ? (
          <p className="fz-muted" style={{ fontSize: "var(--text-sm)" }}>
            A repeating task keeps its days from its repeat setting. Change that in the details
            below.
          </p>
        ) : (
          <div className="fz-row">
            <Button
              variant="line"
              small
              disabled={busy || !today}
              onClick={() =>
                today &&
                run(
                  () => rescheduleTask(task.id, { dueDate: addDays(today, 1) }),
                  "Moved to tomorrow.",
                )
              }
            >
              Tomorrow
            </Button>
            <Button
              variant="line"
              small
              disabled={busy || !today}
              onClick={() =>
                today &&
                run(
                  () => rescheduleTask(task.id, { dueDate: addDays(today, 7) }),
                  "Moved to next week.",
                )
              }
            >
              Next week
            </Button>
            <Button
              variant="line"
              small
              disabled={busy}
              onClick={() =>
                run(() => rescheduleTask(task.id, { dueDate: null }), "No date for now.")
              }
            >
              No date
            </Button>
          </div>
        )}
        {!isRepeating ? (
          <div className="fz-row">
            <TextField
              label="Or pick a day"
              type="date"
              value={customDate}
              onChange={(event) => setCustomDate(event.target.value)}
            />
            <Button
              variant="line"
              small
              disabled={busy || !customDate}
              onClick={() => run(() => rescheduleTask(task.id, { dueDate: customDate }), "Moved.")}
            >
              Move it
            </Button>
          </div>
        ) : null}
      </div>

      {task.parentTaskId === null ? (
        <div className="fz-stack">
          <TextAreaField
            label="Break it into steps"
            hint={`One step per line, up to ${MAX_STEPS}. Small enough to start.`}
            value={steps}
            onChange={(event) => setSteps(event.target.value)}
            rows={4}
          />
          <div className="fz-row">
            <Button
              variant="line"
              small
              disabled={busy || stepTitles.length === 0 || stepTitles.length > MAX_STEPS}
              onClick={() =>
                run(async () => {
                  await breakDownTask(
                    task.id,
                    stepTitles.map((title) => ({ title })),
                  );
                  setSteps("");
                }, "Broken into steps.")
              }
            >
              Break it down
            </Button>
          </div>
        </div>
      ) : null}

      <div className="fz-stack">
        <p className="fz-muted" style={{ fontSize: "var(--text-sm)" }}>
          Hide it for a while
        </p>
        <div className="fz-row">
          <Button
            variant="line"
            small
            disabled={busy}
            onClick={() => run(() => snoozeTask(task.id), "Hidden for three days.")}
          >
            Three days
          </Button>
          <Button
            variant="line"
            small
            disabled={busy || !today}
            onClick={() =>
              today && run(() => snoozeTask(task.id, addDays(today, 7)), "Hidden for a week.")
            }
          >
            A week
          </Button>
        </div>
      </div>

      <div className="fz-stack">
        {dropping ? (
          <>
            <p>Let it go? It leaves all your lists. It stays in your export.</p>
            <div className="fz-row">
              <Button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await dropTask(task.id);
                    setDropping(false);
                  }, "Let go. It's off your lists.")
                }
              >
                Yes, let it go
              </Button>
              <Button variant="quiet" onClick={() => setDropping(false)}>
                Keep it
              </Button>
            </div>
          </>
        ) : (
          <div className="fz-row">
            <Button variant="quiet" onClick={() => setDropping(true)}>
              Let it go
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
