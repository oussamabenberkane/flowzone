"use client";

/**
 * The eddy: a quiet pocket on Today for tasks that could use a fresh look. Nothing here is
 * red, and nothing says "overdue" or counts days. Each item opens the manual options
 * (reschedule, break down, snooze, let go) in a sheet.
 *
 * The extension point `fresh-look-assist` sits in the sheet: AI help can be offered alongside
 * the manual options without replacing them.
 */
import { useState } from "react";
import type { FreshLookItemView, FreshLookReason } from "@/shared/views";
import { Sheet, Button } from "@/ui/primitives";
import { FreshLookActions } from "@/ui/fresh-look/fresh-look-actions";
import { ExtensionSlot } from "@/ui/extensions/slots";
import { IconEddy } from "@/ui/icons";
import { FreshLookAssist } from "@/ui/ai/fresh-look-help";
import { useAi } from "@/ui/ai/use-ai";

const REASON_TEXT: Record<FreshLookReason, string> = {
  date_passed: "It was planned for an earlier day.",
  stale: "It has been quiet for a while.",
};

const SHOWN_AT_ONCE = 3;

export function Eddy({ items, today }: { items: FreshLookItemView[]; today: string | null }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const ai = useAi();
  if (items.length === 0) return null;

  const shown = items.slice(0, SHOWN_AT_ONCE);
  const open = items.find((item) => item.task.id === openId) ?? null;

  return (
    <section className="fz-eddy fz-section" aria-labelledby="eddy-title" data-testid="eddy">
      <h2 id="eddy-title">A few leaves could use a fresh look</h2>
      <p>They are not urgent. Choose one when you feel like it.</p>
      <ul className="fz-list" style={{ marginTop: "var(--space-3)" }}>
        {shown.map((item) => (
          <li key={item.task.id} className="fz-fresh-item" data-testid="eddy-item">
            <div className="fz-task-body" style={{ padding: 0 }}>
              <span style={{ fontWeight: 600 }}>{item.task.title}</span>
              <span className="fz-task-meta">{REASON_TEXT[item.reason]}</span>
            </div>
            <div>
              <Button
                variant="line"
                small
                onClick={() => setOpenId(item.task.id)}
                aria-label={`Look at ${item.task.title}`}
              >
                <IconEddy aria-hidden="true" width={18} height={18} />
                Look at this
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {items.length > SHOWN_AT_ONCE ? (
        <p className="fz-muted" style={{ marginTop: "var(--space-2)", fontSize: "var(--text-sm)" }}>
          {items.length - SHOWN_AT_ONCE} more are in your Inbox when you want them.
        </p>
      ) : null}

      <Sheet
        open={open !== null}
        onClose={() => setOpenId(null)}
        title="A fresh look"
        testId="fresh-look-sheet"
      >
        {open ? (
          <>
            <p style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>{open.task.title}</p>
            <p className="fz-muted">{REASON_TEXT[open.reason]}</p>
            <ExtensionSlot name="fresh-look-assist" fallback={null}>
              {ai.features ? (
                <FreshLookAssist task={open.task} onDone={() => setOpenId(null)} />
              ) : undefined}
            </ExtensionSlot>
            <FreshLookActions task={open.task} today={today} onDone={() => setOpenId(null)} />
          </>
        ) : null}
      </Sheet>
    </section>
  );
}
