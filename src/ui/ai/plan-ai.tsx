"use client";

/**
 * The `plan-day-proposal` slot: an AI-ranked short list (three to five tasks, each with a reason).
 * It fills the plan sheet's selection when the person chooses it. Nothing is saved until the
 * person presses "Set today's plan" in the sheet. If the AI cannot help, the rules-based list
 * below the slot still works, and this says so in one calm line.
 */
import { useState } from "react";
import type { EnergyLevel } from "@/shared/views";
import { messageFor } from "@/ui/api/client";
import { Button, Notice } from "@/ui/primitives";
import { todayProposal, type TodayProposalView } from "./ai-api";
import { RESTING_COPY } from "./ai-copy";
import styles from "./ai.module.css";

export function PlanAiProposal({
  energy,
  onUse,
}: {
  /** The energy the person chose in the sheet, if any. */
  energy?: EnergyLevel;
  /** Puts these task ids in the sheet's selection, in this order. The person still confirms. */
  onUse: (taskIds: string[]) => void;
}) {
  const [result, setResult] = useState<TodayProposalView | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [used, setUsed] = useState(false);

  async function ask() {
    setBusy(true);
    setProblem(null);
    setUsed(false);
    try {
      setResult(await todayProposal(energy));
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  const ranked = result?.source === "ai" ? result.items : [];

  return (
    <section className={styles.group} aria-labelledby="plan-ai-title" data-testid="plan-ai">
      <h3 id="plan-ai-title">Suggested order</h3>
      <div className={styles.dataRow}>
        <Button
          variant="line"
          small
          disabled={busy}
          onClick={() => void ask()}
          data-testid="plan-ai-ask"
        >
          {busy ? "Thinking…" : result ? "Ask again" : "Choose three to five for me"}
        </Button>
      </div>

      {problem ? <Notice role="alert">{problem}</Notice> : null}

      {result && result.source === "rules" ? (
        <Notice>
          {result.reason
            ? RESTING_COPY[result.reason]
            : "There aren't enough open tasks to rank yet. The list below still works."}
        </Notice>
      ) : null}

      {ranked.length > 0 ? (
        <>
          <ol className={styles.profileList} data-testid="plan-ai-items">
            {ranked.map((item) => (
              <li key={item.task.id} className={styles.profileItem}>
                <p className={styles.profileText}>{item.task.title}</p>
                <p className={styles.profileMeta}>{item.reason}</p>
              </li>
            ))}
          </ol>
          <div className={styles.dataRow}>
            <Button
              small
              disabled={used}
              data-testid="plan-ai-use"
              onClick={() => {
                onUse(ranked.map((item) => item.task.id));
                setUsed(true);
              }}
            >
              {used ? "Put in the list below" : "Use this order"}
            </Button>
          </div>
          {used ? (
            <p className={styles.lede} role="status">
              Check the list below, then set today&apos;s plan.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
