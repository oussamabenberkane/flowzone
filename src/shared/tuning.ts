/**
 * Domain tuning constants: the ONE place to change how FlowZone behaves numerically.
 * Documented in docs/contracts/api.md (section "Tuning constants") and in
 * docs/handoff/02-backend.md. Change a value here and nowhere else.
 *
 * Shared (browser and server) because the interface may show the same limits.
 * Pure constants only: no imports.
 */

/** How many items the Today suggestion proposes at most. */
export const TODAY_SUGGESTION_SIZE = 5;

/** How many items a person may put in one day's plan. Editing is always allowed up to this. */
export const TODAY_PLAN_MAX_ITEMS = 10;

/** A task with no activity for this many days needs a fresh look (resurfacing candidate). */
export const STALE_THRESHOLD_DAYS = 7;

/** After this many consecutive skipped occurrences the product offers to adjust or pause. */
export const CONSECUTIVE_SKIPS_THRESHOLD = 3;

/**
 * How far back the consecutive-skip count looks, in occurrences. The reported count never
 * exceeds this number (for a daily task that is about two months).
 */
export const CONSECUTIVE_SKIPS_LOOKBACK = 60;

/** A task whose date is today or within this many days ahead counts as "due soon" for Today. */
export const DUE_SOON_DAYS = 2;

/** Default length of a snooze when the request does not give a date. */
export const SNOOZE_DEFAULT_DAYS = 3;

/** Default and maximum page sizes for lists. */
export const LIST_DEFAULT_LIMIT = 50;
export const LIST_MAX_LIMIT = 200;
export const FRESH_LOOK_DEFAULT_LIMIT = 20;
export const RESURFACING_DEFAULT_LIMIT = 3;
export const RESURFACING_MAX_LIMIT = 20;
export const SEARCH_DEFAULT_LIMIT = 20;
export const SEARCH_MAX_LIMIT = 50;

/** Upper bound on how many open tasks Today and fresh-look examine in one request. */
export const CANDIDATE_POOL_LIMIT = 300;

/** Maximum subtasks a single break-down request may create. */
export const BREAKDOWN_MAX_STEPS = 10;

/** Settings defaults. The time zone is refined by the app on first run. */
export const DEFAULT_TIME_ZONE = "UTC";
export const DEFAULT_QUIET_HOURS_START = "21:00";
export const DEFAULT_QUIET_HOURS_END = "08:00";

/** Limits on user-written text (characters). */
export const TITLE_MAX_LENGTH = 500;
export const PROJECT_NAME_MAX_LENGTH = 80;
export const ENTRY_TITLE_MAX_LENGTH = 200;
export const ENTRY_BODY_MAX_LENGTH = 20_000;

/** Estimate bounds in minutes. */
export const ESTIMATE_MIN_MINUTES = 1;
export const ESTIMATE_MAX_MINUTES = 1440;
