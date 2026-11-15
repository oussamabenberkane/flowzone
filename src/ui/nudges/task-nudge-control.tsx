"use client";

/**
 * The per-task nudge control on the task detail screen. Fills the `task-detail-mute` slot. One tap
 * to stop nudges about this task, or to pause them for a few days. It never changes the task itself.
 * Contract: docs/contracts/nudges.md, section 9.
 */
import { messageFor } from "@/ui/api/client";
import { getSettings } from "@/ui/api/resources";
import { setQueryData, useQuery } from "@/ui/data/query";
import { dayLabel } from "@/ui/format";
import { localDay } from "./local-day";
import { Button, Notice } from "@/ui/primitives";
import { useToast } from "@/ui/toast";
import { useState } from "react";
import { getTaskNudgeControl, setTaskNudgeControl } from "./nudges-api";
import type { TaskNudgeControlView } from "@/shared/nudges";

export function TaskNudgeControl({ taskId }: { taskId: string }) {
  const settings = useQuery("settings", getSettings);
  const key = `nudge-control:${taskId}`;
  const control = useQuery(key, () => getTaskNudgeControl(taskId));
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Only meaningful while nudges are on. Otherwise the slot stays empty.
  if (settings.data === undefined || !settings.data.consent.nudges.enabled) return null;
  if (control.data === undefined) {
    return control.status === "error" ? (
      <Notice tone="problem" role="alert">
        {messageFor(control.error)}
      </Notice>
    ) : null;
  }

  const view = control.data;
  const snoozed = view.snoozedUntil !== null && new Date(view.snoozedUntil) > new Date();

  async function change(body: { muted?: boolean; snoozed?: boolean }, saved: string) {
    setBusy(true);
    setProblem(null);
    try {
      const next = await setTaskNudgeControl(taskId, body);
      setQueryData<TaskNudgeControlView>(key, () => next);
      toast.show(saved);
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  const status = view.muted
    ? "Nudges about this task are off."
    : snoozed && view.snoozedUntil
      ? `Nudges about this task are paused until ${dayLabel(localDay(view.snoozedUntil), null)}.`
      : "Nudges about this task are on.";

  return (
    <section
      className="fz-stack"
      aria-label="Nudges for this task"
      style={{ margin: "var(--space-4) 0" }}
    >
      <p style={{ margin: 0 }}>{status}</p>
      <div className="fz-row">
        {view.muted ? (
          <Button
            variant="line"
            small
            disabled={busy}
            onClick={() => void change({ muted: false }, "Saved.")}
          >
            Turn nudges back on
          </Button>
        ) : (
          <Button
            variant="line"
            small
            disabled={busy}
            onClick={() => void change({ muted: true }, "Saved.")}
          >
            Stop nudges for this task
          </Button>
        )}
        {!view.muted ? (
          <Button
            variant="quiet"
            small
            disabled={busy}
            onClick={() => void change({ snoozed: !snoozed }, "Saved.")}
          >
            {snoozed ? "Start nudges again now" : "Not for 3 days"}
          </Button>
        ) : null}
      </div>
      <p className="fz-muted" style={{ margin: 0 }}>
        This only changes reminders. The task stays as it is.
      </p>
      {problem ? (
        <Notice tone="problem" role="alert">
          {problem}
        </Notice>
      ) : null}
    </section>
  );
}
