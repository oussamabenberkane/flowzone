/**
 * The nudge rules, as pure functions: no database, no clock of their own (the caller passes
 * the instant). Owned by the Nudges agent. Contract: docs/contracts/nudges.md, section 3.
 *
 * Nothing here is ever described as "overdue" or "late", and no field counts days late.
 */
import {
  NUDGE_CHECK_IN_GAP_HOURS,
  NUDGE_DAILY_CAP,
  NUDGE_TASK_GAP_HOURS,
  NUDGE_TICK_WINDOW_MINUTES,
} from "@/shared/nudge-tuning";
import type { NudgeKind } from "@/shared/nudges";

/** Why a person was not nudged in a run. Stable codes; they appear in the tick summary. */
export type SkipReason =
  | "nudges_off"
  | "quiet_hours"
  | "daily_cap"
  | "no_device"
  | "no_candidate"
  | "task_gap"
  | "muted"
  | "snoozed"
  | "check_in_gap"
  | "already_handled"
  | "error";

/** One thing that could be nudged about, before the caps and gaps are applied. */
export interface NudgeCandidate {
  kind: NudgeKind;
  taskId: string;
  /** The task's title, as the person wrote it. Used in the notification text only. */
  title: string;
  /** Stable code for the reason. Stored in the nudge log. */
  reasonCode: "due_at" | "due_today" | "planned_earlier" | "quiet_for_a_while";
  /**
   * The concrete reason as a short phrase, for example "due at 5:00 pm". Every nudge text
   * must contain it, so the person always learns why they were nudged.
   */
  reason: string;
}

/** The state the gates need. Built by the engine from the nudge log, controls and the clock. */
export interface GateState {
  /** Tasks with a nudge created within the task gap (pending or sent). */
  recentTaskIds: ReadonlySet<string>;
  /** Tasks the person muted for nudges. */
  mutedTaskIds: ReadonlySet<string>;
  /** Tasks whose nudges are snoozed right now. */
  snoozedTaskIds: ReadonlySet<string>;
  /** True when a check-in nudge (any task) was made within the check-in gap. */
  checkInRecent: boolean;
}

const MINUTE_MS = 60_000;

/** Minutes after midnight for "HH:MM". */
export function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/**
 * True when `time` falls inside quiet hours. The window may cross midnight (21:00 to 08:00).
 * Equal start and end means there are no quiet hours.
 */
export function isQuietAt(time: string, start: string, end: string): boolean {
  const t = minutesOf(time);
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/** The local day ("YYYY-MM-DD") and time ("HH:MM") of an instant in a time zone. */
export function localClock(now: Date, timeZone: string): { day: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    day: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

/** The start of the tick window an instant belongs to, as an ISO timestamp (30-minute windows). */
export function tickWindowFor(now: Date): string {
  const size = NUDGE_TICK_WINDOW_MINUTES * MINUTE_MS;
  return new Date(Math.floor(now.getTime() / size) * size).toISOString();
}

/** "17:00" becomes "5:00 pm", the way the interface writes times. */
export function formatClock(time: string): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const suffix = hours < 12 ? "am" : "pm";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** True when this many nudges already belong to the day (every nudge type counts). */
export function dailyCapReached(sentToday: number): boolean {
  return sentToday >= NUDGE_DAILY_CAP;
}

/** The instant before which a nudge log row no longer counts for the task gap or check-in gap. */
export function gapWindowStart(now: Date): Date {
  const hours = Math.max(NUDGE_TASK_GAP_HOURS, NUDGE_CHECK_IN_GAP_HOURS);
  return new Date(now.getTime() - hours * 60 * MINUTE_MS);
}

/** Priority between kinds: the most time-sensitive first. */
const KIND_RANK: Record<NudgeKind, number> = { due_soon: 0, check_in: 1, resurface: 2 };

/**
 * Chooses the single best candidate that passes every gate, or explains why none does.
 * `candidates` must already be in the order the sources produced them (most time-sensitive
 * first within a kind). The first candidate, by kind rank then source order, that no gate
 * blocks is chosen.
 */
export function pickNudge(
  candidates: readonly NudgeCandidate[],
  gate: GateState,
): { candidate: NudgeCandidate } | { candidate: null; reason: SkipReason } {
  if (candidates.length === 0) return { candidate: null, reason: "no_candidate" };

  const ordered = [...candidates].sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]);
  let firstBlock: SkipReason | null = null;

  for (const candidate of ordered) {
    const block = blockFor(candidate, gate);
    if (block === null) return { candidate };
    firstBlock ??= block;
  }
  return { candidate: null, reason: firstBlock ?? "no_candidate" };
}

function blockFor(candidate: NudgeCandidate, gate: GateState): SkipReason | null {
  if (gate.mutedTaskIds.has(candidate.taskId)) return "muted";
  if (gate.snoozedTaskIds.has(candidate.taskId)) return "snoozed";
  if (gate.recentTaskIds.has(candidate.taskId)) return "task_gap";
  if (candidate.kind === "check_in" && gate.checkInRecent) return "check_in_gap";
  return null;
}
