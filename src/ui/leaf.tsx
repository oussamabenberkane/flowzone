"use client";

/*
 * The leaf is FlowZone's task mark, and it is also the checkbox. An open task is a leaf on the
 * water, an in-progress task is a leaf the current has caught (filled), and a finished task
 * has become a pebble. Shape and state carry the meaning; the colour only reinforces it.
 */
import type { TaskStatus } from "@/shared/views";

export function Leaf({ done = false }: { done?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      {done ? (
        <ellipse className="fz-leaf-body" cx="16" cy="18" rx="9.5" ry="6.5" />
      ) : (
        <>
          <path className="fz-leaf-body" d="M6 22C6 12.5 13 6.5 26 6c0 11-6 17.5-20 16Z" />
          <path className="fz-leaf-vein" d="M9.5 21 22 10" />
        </>
      )}
    </svg>
  );
}

/** A task's leaf as a checkbox. Tapping it completes the task (or reopens a finished one). */
export function LeafCheck({
  title,
  status,
  onToggle,
  disabled = false,
  testId,
}: {
  title: string;
  status: TaskStatus;
  onToggle: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  const done = status === "completed";
  const active = status === "in_progress";
  const classes = ["fz-leaf", done ? "is-done" : "", active ? "is-active" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`${title}. ${done ? "Done. Select to reopen." : "Not done. Select to complete."}`}
      className={classes}
      onClick={onToggle}
      disabled={disabled}
      data-testid={testId}
      data-status={status}
    >
      <Leaf done={done} />
    </button>
  );
}
