/**
 * Plain-language dates and times for the screens. Calendar dates ("2026-11-15") are formatted
 * in UTC so they never shift a day. The day that counts as "today" always comes from the
 * server (TodayView.date); this file only words it.
 */
import { addDays } from "@/shared/calendar";

const WEEKDAY_LONG = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" });
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const TIME = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

function asUtc(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "Saturday 14 November", for the top of Today. */
export function longDate(date: string): string {
  const d = asUtc(date);
  return `${WEEKDAY_LONG.format(d)} ${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "long", timeZone: "UTC" })}`;
}

/**
 * "Today", "Tomorrow", otherwise "Mon 16 Nov" (with the year when it is not this year).
 * Past dates are shown the same way, never as a failure.
 */
export function dayLabel(date: string, today: string | null): string {
  if (today && date === today) return "Today";
  if (today && date === addDays(today, 1)) return "Tomorrow";
  const d = asUtc(date);
  const sameYear = !today || date.slice(0, 4) === today.slice(0, 4);
  return sameYear ? DAY_MONTH.format(d) : DAY_MONTH_YEAR.format(d);
}

/** "17:00" -> "5:00 pm". */
export function timeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return TIME.format(new Date(Date.UTC(2000, 0, 1, h, m)));
}

/** An instant (ISO timestamp) shown in this device's own time zone, for example "4:01 pm". */
export function localTimeLabel(instant: string): string {
  return new Date(instant).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** A short line about when a task is, for example "Tomorrow, 5:00 pm" or "Recurs every 2 days". */
export function whenLabel(options: {
  dueDate: string | null;
  dueTime: string | null;
  today: string | null;
}): string | null {
  if (!options.dueDate) return null;
  const day = dayLabel(options.dueDate, options.today);
  return options.dueTime ? `${day}, ${timeLabel(options.dueTime)}` : day;
}

export function estimateLabel(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes < 60) return `About ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `About ${hours} h` : `About ${hours} h ${rest} min`;
}

/** The weekday index (0 = Sunday) of a calendar date, for the repeat editor. */
export function weekdayIndex(date: string): number {
  return asUtc(date).getUTCDay();
}

export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
