"use client";

/**
 * Extension points: named places where later features plug in without changing the screen
 * that hosts them. Each slot has a manual alternative, so the app is complete with nothing
 * plugged in. The full list, with what each slot is for, is in docs/contracts/design-system.md.
 *
 * Usage (a host screen):
 *   <ExtensionSlot name="plan-day-proposal" fallback={<RulesPlan />} />
 *
 * Usage (a feature that fills the slot):
 *   <ExtensionSlot name="plan-day-proposal" fallback={<RulesPlan />}>
 *     <AiPlanProposal />
 *   </ExtensionSlot>
 *
 * When children are given they replace the fallback. When nothing is given, the fallback
 * (or nothing) is shown. The wrapper has `display: contents`, so it adds no box of its own.
 */
import type { ReactNode } from "react";

export type SlotName =
  | "global-assistant"
  | "plan-day-proposal"
  | "task-assist"
  | "quick-add-assist"
  | "fresh-look-assist"
  | "reflection-prompt"
  | "settings-sections"
  | "notifications-section"
  | "task-detail-mute";

export function ExtensionSlot({
  name,
  children,
  fallback = null,
}: {
  name: SlotName;
  children?: ReactNode;
  fallback?: ReactNode;
}) {
  const filled = children !== undefined && children !== null && children !== false;
  return (
    <div className="fz-slot" data-slot={name} data-filled={filled ? "true" : "false"}>
      {filled ? children : fallback}
    </div>
  );
}
