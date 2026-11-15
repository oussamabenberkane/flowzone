"use client";

/**
 * The `task-assist` slot, for "I'm stuck" on Focus and "break it into steps" on the task detail.
 * It asks the AI for two to five small steps. The steps are added through the same rules as any
 * step the person adds, and they show as an applied card with Undo. If the AI is resting, the
 * steps can still be written by hand in the manual section, so the message says so.
 */
import { useState } from "react";
import { messageFor } from "@/ui/api/client";
import { refreshTaskViews } from "@/ui/tasks/task-actions";
import { Button, LoadingLine, Notice } from "@/ui/primitives";
import { breakDownTaskWithAi, type ActionCardView } from "./ai-api";
import { ActionCard } from "./action-card";
import { RESTING_COPY } from "./ai-copy";
import styles from "./ai.module.css";

export function TaskAssist({
  taskId,
  label,
  testId,
}: {
  taskId: string;
  label: string;
  testId?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [card, setCard] = useState<ActionCardView | null>(null);
  const [added, setAdded] = useState(false);

  async function breakDown() {
    setBusy(true);
    setProblem(null);
    setAdded(false);
    setCard(null);
    try {
      const result = await breakDownTaskWithAi(taskId);
      if (!result.available) {
        setProblem(`${RESTING_COPY[result.reason]} You can write the steps by hand below.`);
        return;
      }
      await refreshTaskViews(taskId);
      setCard(result.card);
      setAdded(result.card === null);
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.group} aria-label="Help with this task" data-testid={testId}>
      <div className={styles.dataRow}>
        <Button
          variant="line"
          small
          disabled={busy}
          onClick={() => void breakDown()}
          data-testid="task-assist-break"
        >
          {busy ? "Working on it…" : label}
        </Button>
      </div>
      {busy ? <LoadingLine label="Finding small steps…" /> : null}
      {problem ? <Notice role="alert">{problem}</Notice> : null}
      {card ? <ActionCard card={card} /> : null}
      {added ? (
        <p className={styles.lede} role="status">
          Steps added.
        </p>
      ) : null}
    </section>
  );
}
