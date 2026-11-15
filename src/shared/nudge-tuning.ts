/**
 * Nudge tuning constants: the ONE place to change how often and when nudges happen.
 * Owned by the Nudges agent. Documented in docs/contracts/nudges.md.
 *
 * Shared (browser and server) because the interface shows the same limits.
 * Pure constants only: no imports.
 */

/** Most nudges one person receives per calendar day (their time zone). Every nudge type counts. */
export const NUDGE_DAILY_CAP = 3;

/** At most one nudge per task within this many hours. */
export const NUDGE_TASK_GAP_HOURS = 72;

/** At most one gentle check-in (any task) within this many hours. */
export const NUDGE_CHECK_IN_GAP_HOURS = 72;

/** A timed task is nudged when its time is at most this many minutes away (and not yet passed). */
export const NUDGE_DUE_SOON_LEAD_MINUTES = 180;

/** Length of a nudge snooze ("Not for 3 days"), in days. Snoozing never changes the task. */
export const NUDGE_SNOOZE_DAYS = 3;

/** The scheduler's cadence. A nudge decision is made once per window; calls in one window are no-ops. */
export const NUDGE_TICK_WINDOW_MINUTES = 30;

/** A push that the push service has not delivered within this time is dropped (seconds). */
export const NUDGE_PUSH_TTL_SECONDS = 30 * 60;

/** How long the app waits for AI wording before using the fixed template instead (milliseconds). */
export const NUDGE_WORDING_TIMEOUT_MS = 4000;

/** Consecutive push failures (not "gone" answers) after which a device is removed. */
export const NUDGE_DEVICE_MAX_FAILURES = 5;

/** The app name shown as the notification title. */
export const NUDGE_NOTIFICATION_TITLE = "FlowZone";
