"use client";

/**
 * Today: the stretch of water in front of you. A short list, planned on purpose, with the
 * quiet eddy and the evening reflection underneath. It never shows the whole task list.
 *
 * Works from the server's Today. When the network is gone it shows the copy saved on this
 * device, read-only, and says so.
 */
import Link from "next/link";
import { useState } from "react";
import { TODAY_PLAN_MAX_ITEMS } from "@/shared/tuning";
import type { DayPlanView, TaskView } from "@/shared/views";
import { messageFor } from "@/ui/api/client";
import { putPlan } from "@/ui/api/resources";
import { setQueryData, useQuery } from "@/ui/data/query";
import { localTimeLabel, longDate } from "@/ui/format";
import { useOnline } from "@/ui/offline/connection";
import { ExtensionSlot } from "@/ui/extensions/slots";
import { IconClose, IconDown, IconFocus, IconUp } from "@/ui/icons";
import { Button, EmptyState, IconButton, LoadingLine, Notice, ScreenTitle } from "@/ui/primitives";
import { TaskRow } from "@/ui/tasks/task-row";
import { useToast } from "@/ui/toast";
import { Eddy } from "./eddy";
import { markPlanPromptDone, planPromptDoneFor } from "./device-prefs";
import { PlanSheet } from "./plan-sheet";
import { ReflectionCard } from "./reflection-card";
import { loadToday, TODAY_KEY, type TodayData } from "./today-data";

export function TodayScreen() {
  const query = useQuery<TodayData>(TODAY_KEY, loadToday);
  const online = useOnline();
  const [planOpen, setPlanOpen] = useState(false);

  if (!query.data) {
    if (query.status === "error") {
      return (
        <div className="fz-stack">
          <Notice role="alert">{messageFor(query.error)}</Notice>
          <div>
            <Button variant="line" onClick={() => void query.refresh()}>
              Try again
            </Button>
          </div>
        </div>
      );
    }
    return <LoadingLine label="Opening the water…" />;
  }

  const { today, freshLook, savedAt } = query.data;
  const date = today.date;
  const readOnly = savedAt !== null || !online;

  return (
    <div className="fz-stream-enter">
      <ScreenTitle title="Today" detail={longDate(date)} />

      {readOnly ? (
        <Notice role="status">
          {savedAt
            ? `This is Today as it was at ${localTimeLabel(savedAt)}. Changes need a connection.`
            : "You're offline. Changes need a connection."}
        </Notice>
      ) : null}

      {!readOnly ? (
        <PlanPrompt date={date} confirmed={today.plan.confirmed} onShow={() => setPlanOpen(true)} />
      ) : null}

      <section className="fz-section" aria-labelledby="plan-title" data-testid="today-plan">
        <div
          className="fz-row"
          style={{ justifyContent: "space-between", marginBottom: "var(--space-3)" }}
        >
          <h2 id="plan-title">For today</h2>
          {!readOnly && today.plan.tasks.length > 0 ? (
            <Button variant="quiet" small onClick={() => setPlanOpen(true)}>
              Change the plan
            </Button>
          ) : null}
        </div>

        {today.plan.tasks.length === 0 ? (
          <EmptyState title="Nothing planned yet.">
            A short list is enough. Choose a few that feel possible.
            {!readOnly ? (
              <span style={{ display: "block", marginTop: "var(--space-3)" }}>
                <Button small onClick={() => setPlanOpen(true)}>
                  Choose for today
                </Button>
              </span>
            ) : null}
          </EmptyState>
        ) : (
          <ul className="fz-list" aria-label="Today's plan">
            {today.plan.tasks.map((task, index) => (
              <TaskRow
                key={task.id}
                task={task}
                today={date}
                testId="plan-task"
                readOnly={readOnly}
                actions={
                  readOnly ? (
                    <FocusLink task={task} />
                  ) : (
                    <PlanControls task={task} index={index} plan={today.plan} today={date} />
                  )
                }
              />
            ))}
          </ul>
        )}

        {!readOnly && today.plan.tasks.length >= TODAY_PLAN_MAX_ITEMS ? (
          <p
            className="fz-muted"
            style={{ marginTop: "var(--space-2)", fontSize: "var(--text-sm)" }}
          >
            That is the most for one day. Take one off to add another.
          </p>
        ) : null}
      </section>

      <Eddy items={freshLook.items} today={date} />
      <ReflectionCard today={date} />

      {!readOnly ? (
        <PlanSheet
          open={planOpen}
          onClose={() => setPlanOpen(false)}
          today={date}
          plan={today.plan}
        />
      ) : null}
      <ExtensionSlot name="task-assist" fallback={null} />
    </div>
  );
}

/** Shown once a day, until a plan is confirmed or the prompt is dismissed. It never blocks. */
function PlanPrompt({
  date,
  confirmed,
  onShow,
}: {
  date: string;
  confirmed: boolean;
  onShow: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  // Shown at most once a day on this device, until a plan is confirmed. Never blocks anything.
  if (confirmed || dismissed || planPromptDoneFor(date)) return null;

  return (
    <section
      className="fz-card fz-section"
      aria-labelledby="plan-prompt-title"
      data-testid="plan-prompt"
    >
      <h2 id="plan-prompt-title">Plan your day?</h2>
      <p className="fz-muted" style={{ marginTop: "var(--space-1)" }}>
        Here are a few that could fit. Keep, change or skip them.
      </p>
      <div className="fz-row" style={{ marginTop: "var(--space-3)" }}>
        <Button
          small
          onClick={() => {
            markPlanPromptDone(date);
            setDismissed(true);
            onShow();
          }}
          data-testid="plan-prompt-show"
        >
          Show me
        </Button>
        <Button
          variant="quiet"
          small
          onClick={() => {
            markPlanPromptDone(date);
            setDismissed(true);
          }}
        >
          Not today
        </Button>
      </div>
    </section>
  );
}

function FocusLink({ task }: { task: TaskView }) {
  return (
    <Link
      href={`/focus/${task.id}`}
      className="fz-icon-button"
      aria-label={`Focus on ${task.title}`}
      title="Focus"
    >
      <IconFocus aria-hidden="true" />
    </Link>
  );
}

/** Reorder, take off and focus, for one planned task. The list changes at once, then is saved. */
function PlanControls({
  task,
  index,
  plan,
  today,
}: {
  task: TaskView;
  index: number;
  plan: DayPlanView;
  today: string;
}) {
  const toast = useToast();
  const count = plan.tasks.length;

  async function savePlan(nextTasks: TaskView[]) {
    const previous = setQueryData<TodayData>(TODAY_KEY, (data) => {
      const current = data as TodayData;
      return {
        ...current,
        today: { ...current.today, plan: { ...current.today.plan, tasks: nextTasks } },
      };
    });
    try {
      await putPlan(today, { taskIds: nextTasks.map((item) => item.id) });
    } catch (error) {
      if (previous) setQueryData<TodayData>(TODAY_KEY, () => previous);
      toast.show(messageFor(error), { tone: "problem" });
    }
  }

  function move(delta: number) {
    const target = index + delta;
    if (target < 0 || target >= count) return;
    const next = [...plan.tasks];
    [next[index], next[target]] = [next[target], next[index]];
    void savePlan(next);
  }

  return (
    <div className="fz-task-actions">
      <IconButton label={`Move ${task.title} up`} onClick={() => move(-1)} disabled={index === 0}>
        <IconUp />
      </IconButton>
      <IconButton
        label={`Move ${task.title} down`}
        onClick={() => move(1)}
        disabled={index === count - 1}
      >
        <IconDown />
      </IconButton>
      <IconButton
        label={`Take ${task.title} off today's plan`}
        onClick={() => void savePlan(plan.tasks.filter((item) => item.id !== task.id))}
      >
        <IconClose />
      </IconButton>
      <FocusLink task={task} />
    </div>
  );
}
