"use client";

/**
 * The `quick-add-assist` slot: an optional, second reading of the capture text by the AI. The
 * deterministic reading above it always works. This only runs when the person asks for it, so
 * it never spends the daily allowance by itself. Choosing "Use this reading" fills the fields,
 * which the person can still correct before saving.
 */
import { useState } from "react";
import type { QuickAddView } from "@/shared/views";
import { messageFor } from "@/ui/api/client";
import { dayLabel, timeLabel } from "@/ui/format";
import { Button, Notice } from "@/ui/primitives";
import { parseCapture, type CaptureResultView } from "./ai-api";
import { RESTING_COPY } from "./ai-copy";
import styles from "./ai.module.css";

export function CaptureHint({
  text,
  today,
  onUse,
}: {
  /** The text on screen. The hint is remounted when it changes, so a stale reading never shows. */
  text: string;
  today: string | null;
  onUse: (parsed: QuickAddView) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<CaptureResultView | null>(null);

  async function readAgain() {
    setBusy(true);
    setProblem(null);
    try {
      setResult(await parseCapture(text));
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  const parsed = result?.parsed;
  const ai = result?.source === "ai";

  return (
    <section
      className={styles.group}
      aria-labelledby="capture-hint-title"
      data-testid="capture-hint"
    >
      <h3 id="capture-hint-title">A closer reading</h3>
      {!result ? (
        <div className={styles.dataRow}>
          <Button
            variant="line"
            small
            disabled={busy || text.trim().length === 0}
            onClick={() => void readAgain()}
            data-testid="capture-hint-ask"
          >
            {busy ? "Reading…" : "Read it more carefully"}
          </Button>
        </div>
      ) : null}

      {problem ? <Notice role="alert">{problem}</Notice> : null}

      {result && !ai ? (
        <Notice>
          {result.reason
            ? RESTING_COPY[result.reason]
            : "This reading is the same as the one above."}
        </Notice>
      ) : null}

      {parsed && ai ? (
        <>
          <ul className={styles.profileMeta} style={{ paddingLeft: "var(--space-4)" }}>
            <li>Title: {parsed.title}</li>
            {parsed.dueDate ? (
              <li>Date: {today ? dayLabel(parsed.dueDate, today) : parsed.dueDate}</li>
            ) : null}
            {parsed.dueTime ? <li>Time: {timeLabel(parsed.dueTime)}</li> : null}
            {parsed.projectName ? <li>Project: {parsed.projectName}</li> : null}
            {parsed.priority && parsed.priority !== "normal" ? (
              <li>Priority: {parsed.priority}</li>
            ) : null}
          </ul>
          <div className={styles.dataRow}>
            <Button small onClick={() => onUse(parsed)} data-testid="capture-hint-use">
              Use this reading
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
