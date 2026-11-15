"use client";

/**
 * One thing FlowZone did, or is waiting for a yes on. Low-risk actions show as applied, with
 * Undo while it is possible. Higher-risk actions show as pending, with one explicit tap to go
 * ahead or leave it. The leaf is the mark: moss for done, pebble for waiting.
 *
 * The card keeps the status the server returns after each tap, so it changes in place.
 */
import { useState } from "react";
import { messageFor } from "@/ui/api/client";
import { Leaf } from "@/ui/leaf";
import { Button, Notice } from "@/ui/primitives";
import { confirmAction, rejectAction, undoAction, type ActionCardView } from "./ai-api";
import { afterAiChange } from "./use-ai";
import styles from "./ai.module.css";

const STATUS_NOTE: Partial<Record<ActionCardView["status"], string>> = {
  confirmed: "Done.",
  undone: "Undone.",
  rejected: "Left as it was.",
  expired: "This one expired. Nothing changed.",
  failed: "This one couldn't be done. Nothing changed.",
};

export function ActionCard({
  card,
  onAnnounce,
}: {
  card: ActionCardView;
  onAnnounce?: (text: string) => void;
}) {
  const [current, setCurrent] = useState(card);
  const [seen, setSeen] = useState(card);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // A fresh copy from the server replaces what the card showed before.
  if (card !== seen) {
    setSeen(card);
    setCurrent(card);
  }

  const waiting = current.status === "pending";

  async function run(action: () => Promise<{ action: ActionCardView }>, message: string) {
    setBusy(true);
    setProblem(null);
    try {
      const result = await action();
      setCurrent(result.action);
      await afterAiChange();
      onAnnounce?.(message);
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  const tone = waiting ? styles.cardPending : current.status === "applied" ? "" : styles.cardMuted;

  return (
    <article
      className={`${styles.card} ${tone}`}
      data-testid="action-card"
      data-status={current.status}
      data-tier={current.tier}
      aria-label={waiting ? "Waiting for your yes" : undefined}
    >
      <span className={`${styles.cardLeaf} ${waiting ? styles.cardLeafWaiting : ""}`}>
        <Leaf />
      </span>

      <div className={styles.cardBody}>
        <p className={styles.cardText} data-testid="action-summary">
          {current.summary}
        </p>

        {waiting ? (
          <>
            <p className={styles.cardNote}>Only if you say so. Nothing has changed yet.</p>
            <div className={styles.cardActions}>
              <Button
                small
                disabled={busy}
                data-testid="action-confirm"
                onClick={() => void run(() => confirmAction(current.id), "Done.")}
              >
                {busy ? "Working on it…" : "Yes, do it"}
              </Button>
              <Button
                small
                variant="line"
                disabled={busy}
                data-testid="action-reject"
                onClick={() => void run(() => rejectAction(current.id), "Left as it was.")}
              >
                No, leave it
              </Button>
            </div>
          </>
        ) : current.status === "applied" && current.canUndo ? (
          <div className={styles.cardActions}>
            <Button
              small
              variant="quiet"
              disabled={busy}
              data-testid="action-undo"
              onClick={() => void run(() => undoAction(current.id), "Undone.")}
            >
              Undo
            </Button>
          </div>
        ) : current.status === "applied" ? (
          <p className={styles.cardNote}>Done.</p>
        ) : (
          <p className={styles.cardNote}>{STATUS_NOTE[current.status] ?? ""}</p>
        )}

        {problem ? <Notice role="alert">{problem}</Notice> : null}
      </div>
    </article>
  );
}
