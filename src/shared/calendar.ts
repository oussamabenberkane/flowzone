/**
 * Calendar-date helpers. Pure: no imports from server code, usable in the browser.
 *
 * Dates are plain calendar days ("YYYY-MM-DD") in the owner's time zone. Times of day are
 * "HH:MM" (24-hour). Internally a day is counted as a whole number of days since 1970-01-01
 * so that arithmetic never depends on the server's time zone.
 */

const DAY_MS = 86_400_000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type DayNumber = number;

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** True for a 24-hour time written as HH:MM. */
export function isTimeOfDay(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/** Database time values come back as HH:MM:SS; the API always uses HH:MM. */
export function toTimeOfDay(value: string): string {
  return value.slice(0, 5);
}

export function toDayNumber(date: string): DayNumber {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

export function fromDayNumber(day: DayNumber): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromDayNumber(toDayNumber(date) + days);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(day: DayNumber): number {
  return new Date(day * DAY_MS).getUTCDay();
}

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date "now" falls on in the given IANA time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: "year" | "month" | "day") => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export const MILLISECONDS_PER_DAY = DAY_MS;
