import "server-only";
import { addDays, isCalendarDate, toDayNumber, weekdayOf } from "@/shared/calendar";
import type { ParsedField, TaskPriority } from "@/shared/views";

/**
 * The deterministic quick-add parser. It works without AI. It reads one line of plain
 * text and returns the task title plus the fields it recognised, together with the exact
 * words that produced each one, so the interface can show it and let the person correct it.
 *
 * Recognised (case-insensitive). Markers must stand alone (start of text or after a space):
 *   #Work  or  #"Home renovation"     project name (first one wins)
 *   !high  !low  !normal  or  !!      priority (!! means high)
 *   today, tomorrow                   due date
 *   in 3 days, in 2 weeks             due date relative to today
 *   monday … sunday                   the next such day, today included
 *   next monday                       the such day strictly after today
 *   mon, tue, wed, thu, fri, sat, sun only after on / by / due / for / at / next
 *   2026-11-20                        ISO date
 *   Nov 20, 20 November, 20th of Nov  the next such date, this year or next
 *   5pm, 5:30 pm, 17:30, at 9:15 am, noon   time of day (a date is implied if none)
 * A connector word ("on", "by", "due", "for", "at") in front of a date or time is
 * consumed with it. Numeric dates like 11/12 are NOT recognised (their meaning depends
 * on the locale).
 *
 * If nothing is left after the markers are removed, the original text becomes the title,
 * so a task is never created with an empty title.
 */

export interface QuickAddParse {
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  projectName: string | null;
  priority: TaskPriority | null;
  understood: ParsedField[];
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const MONTH_WORD =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

/** A word boundary after a marker: a space, the end of the text, or light punctuation. */
const END = "(?=\\s|$|[.,;:!?])";
/** Optional connector words that belong to a date or time. */
const CONNECTOR = "(?:(?:on|by|due|for|at)\\s+)?";

/** The first date on or after `today` with this month and day, or null if the day does not exist. */
function nearestYearDate(today: string, month: number, day: number): string | null {
  const year = Number(today.slice(0, 4));
  for (const candidateYear of [year, year + 1]) {
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    const candidate = `${candidateYear}-${mm}-${dd}`;
    if (isCalendarDate(candidate) && candidate >= today) return candidate;
  }
  return null;
}

export function parseQuickAdd(input: string, today: string): QuickAddParse {
  const original = input.trim();
  let rest = original;
  const understood: ParsedField[] = [];

  /** Finds the first match (optionally checked), and removes it from the working text. */
  const take = (pattern: RegExp, accept: (match: RegExpExecArray) => boolean = () => true) => {
    const match = pattern.exec(rest);
    if (!match || !accept(match)) return null;
    rest = `${rest.slice(0, match.index)} ${rest.slice(match.index + match[0].length)}`;
    return match;
  };

  /* Project: #name or #"name with spaces". The first one wins; later markers are removed. */
  const projectPattern = /(?:^|\s)#(?:"([^"]+)"|([\p{L}\p{N}_-]+))/u;
  let projectName: string | null = null;
  for (let match = take(projectPattern); match; match = take(projectPattern)) {
    const name = (match[1] ?? match[2] ?? "").trim();
    if (projectName === null && name !== "") {
      projectName = name;
      understood.push({ field: "project", value: name, text: match[0].trim() });
    }
  }

  /* Priority: !high, !low, !normal, or !! for high. */
  let priority: TaskPriority | null = null;
  const priorityMatch = take(new RegExp(`(?:^|\\s)(!!|!(high|low|normal))${END}`, "iu"));
  if (priorityMatch) {
    priority = (priorityMatch[2] ?? "high").toLowerCase() as TaskPriority;
    understood.push({ field: "priority", value: priority, text: priorityMatch[0].trim() });
  }

  /* Time of day: 12-hour, then 24-hour, then noon. Only the first one counts. */
  let dueTime: string | null = null;
  const time12 = take(
    new RegExp(`(?:^|\\s)${CONNECTOR}(\\d{1,2})(?::([0-5]\\d))?\\s*(am|pm)${END}`, "i"),
    (m) => Number(m[1]) >= 1 && Number(m[1]) <= 12,
  );
  if (time12) {
    const hour12 = Number(time12[1]);
    const minutes = time12[2] ?? "00";
    const isPm = (time12[3] ?? "").toLowerCase() === "pm";
    const hour24 = (hour12 % 12) + (isPm ? 12 : 0);
    dueTime = `${String(hour24).padStart(2, "0")}:${minutes}`;
  } else {
    const time24 = take(new RegExp(`(?:^|\\s)${CONNECTOR}([01]?\\d|2[0-3]):([0-5]\\d)${END}`, "i"));
    if (time24) {
      dueTime = `${(time24[1] ?? "").padStart(2, "0")}:${time24[2] ?? "00"}`;
    } else if (take(new RegExp(`(?:^|\\s)${CONNECTOR}noon${END}`, "i"))) {
      dueTime = "12:00";
    }
  }
  if (dueTime !== null) understood.push({ field: "dueTime", value: dueTime, text: "" });

  /* Due date: the first date form that matches wins. */
  let dueDate: string | null = null;
  const setDate = (value: string, text: string) => {
    dueDate = value;
    understood.push({ field: "dueDate", value, text });
  };

  const isoDate = take(new RegExp(`(?:^|\\s)${CONNECTOR}(\\d{4}-\\d{2}-\\d{2})${END}`, "i"), (m) =>
    isCalendarDate(m[1] ?? ""),
  );
  if (isoDate) setDate(isoDate[1] ?? "", isoDate[0].trim());

  if (dueDate === null) {
    const relative = take(
      new RegExp(`(?:^|\\s)in\\s+(\\d{1,3})\\s+(days?|weeks?)${END}`, "i"),
      (m) => Number(m[1]) >= 1,
    );
    if (relative) {
      const count = Number(relative[1]);
      const isWeeks = (relative[2] ?? "").toLowerCase().startsWith("week");
      setDate(addDays(today, isWeeks ? count * 7 : count), relative[0].trim());
    }
  }

  if (dueDate === null) {
    const keyword = take(new RegExp(`(?:^|\\s)${CONNECTOR}(today|tomorrow)${END}`, "i"));
    if (keyword) {
      const isTomorrow = (keyword[1] ?? "").toLowerCase() === "tomorrow";
      setDate(addDays(today, isTomorrow ? 1 : 0), keyword[0].trim());
    }
  }

  if (dueDate === null) {
    // Full names, with an optional "next". Short forms only after a connector word.
    const fullName = take(
      new RegExp(
        `(?:^|\\s)${CONNECTOR}(next\\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)${END}`,
        "i",
      ),
    );
    const shortName = fullName
      ? null
      : take(
          new RegExp(
            `(?:^|\\s)(?:(?:on|by|due|for|at|next)\\s+)(sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)${END}`,
            "i",
          ),
        );
    const weekday = fullName ?? shortName;
    if (weekday) {
      // The weekday name is always the last capture group.
      const name = (weekday[weekday.length - 1] ?? "").toLowerCase();
      const target = WEEKDAYS[name];
      const isNext = /next/i.test(weekday[0]);
      if (target !== undefined) {
        const todayWeekday = weekdayOf(toDayNumber(today));
        const forward = (target - todayWeekday + 7) % 7;
        const delta = isNext ? forward || 7 : forward;
        setDate(addDays(today, delta), weekday[0].trim());
      }
    }
  }

  if (dueDate === null) {
    const dayThenMonth = take(
      new RegExp(
        `(?:^|\\s)${CONNECTOR}(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_WORD}${END}`,
        "i",
      ),
      (m) => Number(m[1]) >= 1 && Number(m[1]) <= 31,
    );
    const monthThenDay = dayThenMonth
      ? null
      : take(
          new RegExp(`(?:^|\\s)${CONNECTOR}${MONTH_WORD}\\s+(\\d{1,2})(?:st|nd|rd|th)?${END}`, "i"),
          (m) => Number(m[2]) >= 1 && Number(m[2]) <= 31,
        );
    if (dayThenMonth) {
      const day = Number(dayThenMonth[1]);
      const month = MONTHS[(dayThenMonth[2] ?? "").slice(0, 3).toLowerCase()];
      const resolved = month ? nearestYearDate(today, month, day) : null;
      if (resolved) setDate(resolved, dayThenMonth[0].trim());
    } else if (monthThenDay) {
      const day = Number(monthThenDay[2]);
      const month = MONTHS[(monthThenDay[1] ?? "").slice(0, 3).toLowerCase()];
      const resolved = month ? nearestYearDate(today, month, day) : null;
      if (resolved) setDate(resolved, monthThenDay[0].trim());
    }
  }

  // A time with no date is for today.
  if (dueTime !== null && dueDate === null) setDate(today, "");

  /* Title: whatever is left, tidied up. */
  let title = rest
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "")
    .replace(/(\s+(on|at|by|due|for|next))+$/i, "")
    .trim();
  if (title === "") title = original;
  understood.unshift({ field: "title", value: title, text: title });

  return { title, dueDate, dueTime, projectName, priority, understood };
}
