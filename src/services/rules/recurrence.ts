import "server-only";
import { type DayNumber, MILLISECONDS_PER_DAY, weekdayOf } from "@/shared/calendar";
import type { RecurrenceRule } from "@/shared/recurrence";
import type { RecurrenceOutcome } from "@/shared/views";
import { CONSECUTIVE_SKIPS_LOOKBACK, CONSECUTIVE_SKIPS_THRESHOLD } from "@/shared/tuning";

/**
 * Recurrence rules, worked out on read. There is no scheduler: an occurrence exists
 * only as a date computed from the rule, the start date and the records of what was
 * completed or skipped. Pure functions, no database access.
 *
 * Vocabulary:
 *   occurrence  a date the rule produces (on or after the start date)
 *   current     the occurrence the person sees: the next one on or after today, moved on
 *               once it has been completed or skipped
 *   missed      an occurrence that passed with no record. Missed occurrences are skipped
 *               silently. They are only counted (see consecutiveSkips), never shown as a pile.
 */

export interface RecurrenceState {
  paused: boolean;
  /** Null while paused. */
  currentOccurrence: DayNumber | null;
  /** Consecutive occurrences passed without completion, capped at CONSECUTIVE_SKIPS_LOOKBACK. */
  consecutiveSkips: number;
  adjustSuggested: boolean;
}

/** Interval in days for the rules that repeat at a fixed gap. */
function fixedInterval(rule: RecurrenceRule): number | null {
  if (rule.type === "daily") return 1;
  if (rule.type === "every_n_days") return rule.interval;
  return null;
}

/** The first day of a given month (1-based month) on which the monthly rule lands. */
function monthlyOccurrence(year: number, month: number, day: number): DayNumber {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Date.UTC(year, month - 1, Math.min(day, lastDay)) / MILLISECONDS_PER_DAY;
}

function yearAndMonth(day: DayNumber): [number, number] {
  const date = new Date(day * MILLISECONDS_PER_DAY);
  return [date.getUTCFullYear(), date.getUTCMonth() + 1];
}

/** The earliest occurrence on or after `from` (and on or after the start date). */
export function nextOccurrence(
  rule: RecurrenceRule,
  startDay: DayNumber,
  from: DayNumber,
): DayNumber {
  const start = Math.max(from, startDay);
  const interval = fixedInterval(rule);
  if (interval !== null) {
    const steps = Math.ceil((start - startDay) / interval);
    return startDay + steps * interval;
  }
  if (rule.type === "weekly") {
    if (rule.days.length === 0) throw new Error("A weekly rule needs at least one day.");
    for (let offset = 0; offset < 7; offset++) {
      if (rule.days.includes(weekdayOf(start + offset))) return start + offset;
    }
    throw new Error("unreachable: a weekly rule always has a next day within a week");
  }
  if (rule.type !== "monthly") throw new Error("unreachable: every rule type is handled above");
  let [year, month] = yearAndMonth(start);
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = monthlyOccurrence(year, month, rule.day);
    if (candidate >= start) return candidate;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  throw new Error("unreachable: a monthly rule always has a next day within two months");
}

/** The latest occurrence strictly before `before`, or null when there is none since the start. */
export function previousOccurrence(
  rule: RecurrenceRule,
  startDay: DayNumber,
  before: DayNumber,
): DayNumber | null {
  const last = before - 1;
  if (last < startDay) return null;
  const interval = fixedInterval(rule);
  if (interval !== null) {
    const steps = Math.floor((last - startDay) / interval);
    return startDay + steps * interval;
  }
  if (rule.type === "weekly") {
    for (let offset = 0; offset < 7; offset++) {
      const day = last - offset;
      if (day < startDay) return null;
      if (rule.days.includes(weekdayOf(day))) return day;
    }
    return null;
  }
  if (rule.type !== "monthly") throw new Error("unreachable: every rule type is handled above");
  let [year, month] = yearAndMonth(last);
  let candidate = monthlyOccurrence(year, month, rule.day);
  if (candidate > last) {
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    candidate = monthlyOccurrence(year, month, rule.day);
  }
  return candidate >= startDay ? candidate : null;
}

/** True when `day` is one of the rule's occurrences. */
export function isOccurrence(rule: RecurrenceRule, startDay: DayNumber, day: DayNumber): boolean {
  return day >= startDay && nextOccurrence(rule, startDay, day) === day;
}

export interface ResolveInput {
  rule: RecurrenceRule;
  startDay: DayNumber;
  paused: boolean;
  today: DayNumber;
  /** What was completed or skipped, keyed by occurrence day. */
  outcomes: ReadonlyMap<DayNumber, RecurrenceOutcome>;
}

/**
 * Works out where a recurring task stands today. Missed occurrences are never stored: an
 * occurrence with no record that has already passed simply counts as a skip.
 */
export function resolveRecurrence(input: ResolveInput): RecurrenceState {
  if (input.paused) {
    return { paused: true, currentOccurrence: null, consecutiveSkips: 0, adjustSuggested: false };
  }

  // The current occurrence: the next one from today, moved past any already resolved.
  let current = nextOccurrence(input.rule, input.startDay, input.today);
  while (input.outcomes.has(current)) {
    current = nextOccurrence(input.rule, input.startDay, current + 1);
  }

  // Count back from the current occurrence until a completion (or the start) is reached.
  let consecutiveSkips = 0;
  let cursor = current;
  for (let step = 0; step < CONSECUTIVE_SKIPS_LOOKBACK; step++) {
    const previous = previousOccurrence(input.rule, input.startDay, cursor);
    if (previous === null) break;
    if (input.outcomes.get(previous) === "completed") break;
    consecutiveSkips += 1;
    cursor = previous;
  }

  return {
    paused: false,
    currentOccurrence: current,
    consecutiveSkips,
    adjustSuggested: consecutiveSkips >= CONSECUTIVE_SKIPS_THRESHOLD,
  };
}

/** Plain-language description of a rule, for people reading an export. */
export function describeRule(rule: RecurrenceRule): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  switch (rule.type) {
    case "daily":
      return "every day";
    case "every_n_days":
      return `every ${rule.interval} days`;
    case "weekly":
      return `every week on ${rule.days.map((day) => names[day]).join(", ")}`;
    case "monthly":
      return `every month on day ${rule.day}`;
  }
}
