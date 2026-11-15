"use client";

/**
 * Focus: one task, one step at a time. The leaf is the only thing on screen that matters.
 *
 * - The current step is the first open step, or the task itself when it has no steps.
 * - The timer is OFF until the person starts it. It counts down from the task's estimate
 *   (or 25 minutes). When it ends it says so once, without sound or pressure.
 * - "Park a thought" saves a note linked to this task, so an idea is not lost or acted on now.
 * - Completing a step offers the next one. Nothing is awarded, nothing is counted.
 *
 * The extension point `task-assist` sits under the step ("I'm stuck", break down).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { TaskDetailView, TaskView } from "@/shared/views";
import { messageFor } from "@/ui/api/client";
import { createEntry, getTask } from "@/ui/api/resources";
import { useQuery } from "@/ui/data/query";
import { ExtensionSlot } from "@/ui/extensions/slots";
import { LeafCheck } from "@/ui/leaf";
import { completeNow, refreshTaskViews, reopenNow } from "@/ui/tasks/task-actions";
import { Button, EmptyState, LoadingLine, Notice, TextAreaField } from "@/ui/primitives";
import { useToast } from "@/ui/toast";
import { TaskAssist } from "@/ui/ai/task-assist";
import { useAi } from "@/ui/ai/use-ai";
import { Leaf } from "@/ui/leaf";

const DEFAULT_TIMER_MINUTES = 25;

export function FocusScreen({ id }: { id: string }) {
  const query = useQuery(`task:${id}`, () => getTask(id));

  if (!query.data) {
    if (query.status === "error") {
      return (
        <EmptyState
          title="We couldn't find that."
          action={
            <Link href="/today" className="fz-button fz-button--small">
              Back to Today
            </Link>
          }
        >
          {messageFor(query.error)}
        </EmptyState>
      );
    }
    return <LoadingLine label="Finding the leaf…" />;
  }

  return <FocusBody key={`${query.data.id}:${query.data.updatedAt}`} task={query.data} />;
}

function FocusBody({ task }: { task: TaskDetailView }) {
  const toast = useToast();
  const [problem, setProblem] = useState<string | null>(null);
  const [thought, setThought] = useState("");
  const [parking, setParking] = useState(false);
  const [parked, setParked] = useState(0);
  const ai = useAi();

  const openSteps = task.subtasks.filter((step) => step.status !== "completed");
  const step: TaskView | null = openSteps[0] ?? null;
  const taskDone = task.status === "completed";
  const current = step ?? (taskDone ? null : task);
  const repeating = task.recurrence !== null;
  const paused = task.recurrence?.paused === true;

  async function complete(target: TaskView, label: string) {
    setProblem(null);
    try {
      await completeNow(target);
      await refreshTaskViews(task.id);
      toast.show(label);
    } catch (error) {
      setProblem(messageFor(error));
    }
  }

  async function reopenTask() {
    setProblem(null);
    try {
      await reopenNow(task);
      await refreshTaskViews(task.id);
    } catch (error) {
      setProblem(messageFor(error));
    }
  }

  async function park() {
    const body = thought.trim();
    if (!body) return;
    setParking(true);
    setProblem(null);
    try {
      await createEntry({
        kind: "note",
        body,
        taskId: task.id,
        clientRequestId: crypto.randomUUID(),
      });
      setThought("");
      setParked((count) => count + 1);
      await refreshTaskViews(task.id);
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setParking(false);
    }
  }

  return (
    <div className="fz-focus fz-stream-enter" data-testid="focus-screen">
      <div
        className="fz-muted"
        style={{ fontSize: "var(--text-sm)", textAlign: "left", width: "100%" }}
      >
        <Link href={`/tasks/${task.id}`}>Back to this task</Link>
      </div>

      <FocusLeaf done={taskDone} />

      <div className="fz-stack" style={{ justifyItems: "center" }}>
        <p className="fz-muted">{step ? `A step in “${task.title}”` : "This one"}</p>
        {taskDone ? (
          <>
            <h1 className="fz-focus-step">{task.title}</h1>
            <p className="fz-muted">Done. Nicely finished.</p>
            <Button variant="line" small onClick={() => void reopenTask()}>
              Reopen it
            </Button>
          </>
        ) : (
          <>
            <h1 className="fz-focus-step" data-testid="focus-step">
              {current?.title}
            </h1>
            {current ? (
              <LeafCheck
                title={current.title}
                status={current.status}
                disabled={paused}
                onToggle={() =>
                  void complete(
                    current,
                    step
                      ? openSteps.length > 1
                        ? "Step done."
                        : "Step done. That's the last one."
                      : repeating
                        ? "Done for this time."
                        : "Done.",
                  )
                }
                testId="focus-done"
              />
            ) : null}
            {paused ? <p className="fz-muted">This one is paused for now.</p> : null}
            {step && openSteps.length > 1 ? (
              <p
                className="fz-muted"
                style={{ fontSize: "var(--text-sm)" }}
                data-testid="focus-next"
              >
                Next: {openSteps[1].title}
              </p>
            ) : null}
          </>
        )}
      </div>

      <FocusTimer minutes={task.estimateMinutes ?? DEFAULT_TIMER_MINUTES} />

      <ExtensionSlot name="task-assist" fallback={null}>
        {ai.features ? (
          <TaskAssist taskId={task.id} label="I'm stuck" testId="focus-task-assist" />
        ) : undefined}
      </ExtensionSlot>

      <section
        className="fz-stack"
        style={{ width: "100%", textAlign: "left" }}
        aria-labelledby="park-title"
      >
        <h2 id="park-title">Park a thought</h2>
        <p className="fz-muted" style={{ fontSize: "var(--text-sm)" }}>
          Save an idea to this task so it is not lost. You do not have to act on it now.
        </p>
        <TextAreaField
          label="Your thought"
          value={thought}
          onChange={(event) => setThought(event.target.value)}
          maxLength={20000}
          rows={3}
          data-testid="park-input"
        />
        <div className="fz-row">
          <Button
            variant="line"
            onClick={() => void park()}
            disabled={parking || !thought.trim()}
            data-testid="park-save"
          >
            {parking ? "Parking…" : "Park it"}
          </Button>
          {parked > 0 ? (
            <span role="status" className="fz-muted" style={{ fontSize: "var(--text-sm)" }}>
              Parked. It is in this task&apos;s notes.
            </span>
          ) : null}
        </div>
      </section>

      {problem ? <Notice role="alert">{problem}</Notice> : null}
    </div>
  );
}

/** The single leaf on screen. Decorative: the text next to it says what to do. */
function FocusLeaf({ done }: { done: boolean }) {
  return (
    <div className="fz-focus-leaf" aria-hidden="true">
      <Leaf done={done} />
    </div>
  );
}

/**
 * The optional timer. It starts only when the person asks. Counts down in whole seconds and
 * announces the end once, politely, in a live region.
 */
function FocusTimer({ minutes }: { minutes: number }) {
  const [state, setState] = useState<"off" | "running" | "paused" | "ended">("off");
  const [remaining, setRemaining] = useState(minutes * 60);

  useEffect(() => {
    if (state !== "running") return;
    const timer = window.setInterval(() => {
      setRemaining((seconds) => {
        if (seconds <= 1) {
          window.clearInterval(timer);
          setState("ended");
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state]);

  const reset = () => {
    setRemaining(minutes * 60);
    setState("off");
  };

  if (state === "off") {
    return (
      <div className="fz-stack" style={{ justifyItems: "center" }}>
        <Button variant="line" onClick={() => setState("running")} data-testid="timer-start">
          Start a {minutes} minute timer
        </Button>
        <p className="fz-muted" style={{ fontSize: "var(--text-sm)" }}>
          The timer is off until you start it.
        </p>
      </div>
    );
  }

  const mm = Math.floor(remaining / 60)
    .toString()
    .padStart(2, "0");
  const ss = (remaining % 60).toString().padStart(2, "0");

  return (
    <div className="fz-stack" style={{ justifyItems: "center" }} data-testid="timer">
      <p
        className="fz-timer"
        aria-label={`${Math.floor(remaining / 60)} minutes ${remaining % 60} seconds left`}
      >
        {mm}:{ss}
      </p>
      <p role="status" className="fz-muted" style={{ fontSize: "var(--text-sm)" }}>
        {state === "ended"
          ? "Time's up. Keep going, or take a breath."
          : state === "paused"
            ? "Paused."
            : "Going."}
      </p>
      <div className="fz-row" style={{ justifyContent: "center" }}>
        {state === "running" ? (
          <Button variant="line" small onClick={() => setState("paused")}>
            Pause
          </Button>
        ) : null}
        {state === "paused" ? (
          <Button small onClick={() => setState("running")}>
            Resume
          </Button>
        ) : null}
        <Button variant="quiet" small onClick={reset}>
          Stop the timer
        </Button>
      </div>
    </div>
  );
}
