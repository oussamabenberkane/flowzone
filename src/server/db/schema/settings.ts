import { boolean, text, time, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import {
  DEFAULT_QUIET_HOURS_END,
  DEFAULT_QUIET_HOURS_START,
  DEFAULT_TIME_ZONE,
} from "../../../shared/tuning";
import { userOwnedTable } from "../user-owned-table";

/**
 * One settings row per person: time zone, quiet hours, first-run flag and the four
 * consent switches (all off by default). Each switch also records when it was last
 * changed (null = never changed). Contract: docs/contracts/api.md, "Settings and consent".
 */
export const userSettings = userOwnedTable(
  "user_settings",
  {
    timeZone: text("time_zone").notNull().default(DEFAULT_TIME_ZONE),
    quietHoursStart: time("quiet_hours_start").notNull().default(DEFAULT_QUIET_HOURS_START),
    quietHoursEnd: time("quiet_hours_end").notNull().default(DEFAULT_QUIET_HOURS_END),
    firstRunCompleted: boolean("first_run_completed").notNull().default(false),

    // Canonical switch names are the SQL column names (see src/shared/consent.ts).
    aiFeatures: boolean("ai_features").notNull().default(false),
    aiFeaturesChangedAt: timestamp("ai_features_changed_at", { withTimezone: true }),
    aiNotesJournal: boolean("ai_notes_journal").notNull().default(false),
    aiNotesJournalChangedAt: timestamp("ai_notes_journal_changed_at", { withTimezone: true }),
    aiProfile: boolean("ai_profile").notNull().default(false),
    aiProfileChangedAt: timestamp("ai_profile_changed_at", { withTimezone: true }),
    nudges: boolean("nudges").notNull().default(false),
    nudgesChangedAt: timestamp("nudges_changed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("user_settings_user_uq").on(t.userId)],
);
