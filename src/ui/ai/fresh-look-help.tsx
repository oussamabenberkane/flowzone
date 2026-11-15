"use client";

/**
 * The `fresh-look-assist` slot, in the eddy's sheet above the manual options. The AI offers
 * up to three gentle options; the person picks one. Nothing changes until they do. The manual
 * options below always remain, so this only ever adds a choice.
 */
import { useState } from "react";
import type { TaskView } from "@/shared/views";
import { messageFor } from "@/ui/api/client";
import { rescheduleTask, updateTask } from "@/ui/api/resources";
import { Button, Notice } from "@/ui/primitives";
import { useToast } from "@/ui/toast";
import { refreshTaskViews } from "@/ui/tasks/task-actions";
import {
  breakDownTaskWithAi,
  freshLookHelp,
  type FreshLookOptionView,
  type FreshLookHelpView,
} from "./ai-api";
import { RESTING_COPY } from "./ai-copy";
import styles from "./ai.module.css";

export function FreshLookAssist({ task, onDone }: { task: TaskView; onDone: () => void }) {
  const toast = useToast();
  const [help, setHelp] = useState<FreshLookHelpView | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function ask() {
    setBusy(true);
    setProblem(null);
    try {
      setHelp(await freshLookHelp(task.id));
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  async function choose(option: FreshLookOptionView) {
    setBusy(true);
    setProblem(null);
    try {
      if (option.kind === "reschedule") {
        await rescheduleTask(task.id, { dueDate: option.dueDate });
        toast.show("Moved.");
      } else if (option.kind === "simplify") {
        await updateTask(task.id, { title: option.title });
        toast.show("Renamed.");
      } else {
        const result = await breakDownTaskWithAi(task.id);
        if (!result.available) {
          setProblem(RESTING_COPY[result.reason]);
          return;
        }
        toast.show("Broken into steps.");
      }
      await refreshTaskViews(task.id);
      onDone();
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  // A repeating task keeps its days from its repeat setting, so a date option is not offered.
  const options = (help?.options ?? []).filter(
    (option) => !(option.kind === "reschedule" && task.recurrence !== null),
  );

  return (
    <section className={styles.stack} aria-labelledby="fresh-ai-title" data-testid="fresh-look-ai">
      <h3 id="fresh-ai-title">Gentle options</h3>
      {!help ? (
        <div className={styles.dataRow}>
          <Button
            variant="line"
            small
            disabled={busy}
            onClick={() => void ask()}
            data-testid="fresh-look-ai-ask"
          >
            {busy ? "Thinking…" : "Ask for a few gentle options"}
          </Button>
        </div>
      ) : (
        <>
          {help.source === "rules" && help.reason ? (
            <Notice>{RESTING_COPY[help.reason]}</Notice>
          ) : null}
          <div className={styles.stack}>
            {options.map((option, index) => (
              <div key={`${option.kind}-${index}`} className={styles.group}>
                <p className={styles.lede}>{option.label}</p>
                <div className={styles.dataRow}>
                  <Button
                    small
                    variant="line"
                    disabled={busy}
                    onClick={() => void choose(option)}
                    data-testid="fresh-look-ai-option"
                  >
                    {option.kind === "reschedule"
                      ? "Move it"
                      : option.kind === "simplify"
                        ? "Shorten it"
                        : "Break it down"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {problem ? <Notice role="alert">{problem}</Notice> : null}
    </section>
  );
}
