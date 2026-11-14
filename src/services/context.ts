import "server-only";
import type { UserContext } from "@/server/auth/user-context";
import { type UserScope, forUser } from "@/server/db/scoped";
import { userSettings } from "@/server/db/schema";
import { todayIn } from "@/shared/calendar";
import {
  DEFAULT_QUIET_HOURS_END,
  DEFAULT_QUIET_HOURS_START,
  DEFAULT_TIME_ZONE,
} from "@/shared/tuning";

/**
 * Every service function receives a `ServiceContext`, built once per request (or per
 * background job) from a UserContext. It carries the person's scope (their data only),
 * their time zone, and "today" in that time zone. Services never compute "today" from the
 * server clock. Contract: docs/contracts/api.md, "Time and dates".
 */
export interface ServiceContext {
  readonly user: UserContext;
  readonly scope: UserScope;
  readonly timeZone: string;
  /** Today's calendar date ("YYYY-MM-DD") in the person's time zone. */
  readonly today: string;
  /** The instant the context was created. Used for staleness checks. */
  readonly now: Date;
}

/**
 * The settings row has a fixed client request id, so two simultaneous first requests
 * cannot create two rows (the second one gets the first one back).
 */
const SETTINGS_REQUEST_ID = "settings-singleton";

export async function ensureSettings(scope: UserScope) {
  const [existing] = await scope.list(userSettings, { limit: 1 });
  if (existing) return existing;
  const { row } = await scope.create(
    userSettings,
    {
      timeZone: DEFAULT_TIME_ZONE,
      quietHoursStart: DEFAULT_QUIET_HOURS_START,
      quietHoursEnd: DEFAULT_QUIET_HOURS_END,
      firstRunCompleted: false,
      aiFeatures: false,
      aiFeaturesChangedAt: null,
      aiNotesJournal: false,
      aiNotesJournalChangedAt: null,
      aiProfile: false,
      aiProfileChangedAt: null,
      nudges: false,
      nudgesChangedAt: null,
    },
    { clientRequestId: SETTINGS_REQUEST_ID },
  );
  return row;
}

/** Builds the context for one person. Cheap: one query for their settings. */
export async function createServiceContext(user: UserContext): Promise<ServiceContext> {
  const scope = forUser(user);
  const settings = await ensureSettings(scope);
  const now = new Date();
  return {
    user,
    scope,
    timeZone: settings.timeZone,
    today: todayIn(settings.timeZone, now),
    now,
  };
}
