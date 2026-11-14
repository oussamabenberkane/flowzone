import "server-only";
import type { z } from "zod";
import type { updateConsentSchema, updateSettingsSchema } from "@/shared/api-schemas";
import { type ConsentSwitch } from "@/shared/consent";
import { notFound } from "@/server/http/errors";
import { userSettings } from "@/server/db/schema";
import { toTimeOfDay } from "@/shared/calendar";
import type { SettingsView } from "@/shared/views";
import type { ServiceContext } from "./context";
import { ensureSettings } from "./context";

/**
 * Settings: time zone, quiet hours, first-run flag and the four consent switches.
 * The switches are stored here; the AI and Nudges agents enforce them on the server.
 * Contract: docs/contracts/api.md, "Settings and consent".
 */

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type UpdateConsentInput = z.infer<typeof updateConsentSchema>;

export async function getSettings(ctx: ServiceContext): Promise<SettingsView> {
  const row = await ensureSettings(ctx.scope);
  return {
    timeZone: row.timeZone,
    quietHours: {
      start: toTimeOfDay(row.quietHoursStart),
      end: toTimeOfDay(row.quietHoursEnd),
    },
    firstRunCompleted: row.firstRunCompleted,
    consent: {
      ai_features: {
        enabled: row.aiFeatures,
        changedAt: row.aiFeaturesChangedAt?.toISOString() ?? null,
      },
      ai_notes_journal: {
        enabled: row.aiNotesJournal,
        changedAt: row.aiNotesJournalChangedAt?.toISOString() ?? null,
      },
      ai_profile: {
        enabled: row.aiProfile,
        changedAt: row.aiProfileChangedAt?.toISOString() ?? null,
      },
      nudges: {
        enabled: row.nudges,
        changedAt: row.nudgesChangedAt?.toISOString() ?? null,
      },
    },
  };
}

/** The four switches as plain booleans, for server-side enforcement by other agents. */
export async function consentSwitches(
  ctx: ServiceContext,
): Promise<Record<ConsentSwitch, boolean>> {
  const settings = await getSettings(ctx);
  return {
    ai_features: settings.consent.ai_features.enabled,
    ai_notes_journal: settings.consent.ai_notes_journal.enabled,
    ai_profile: settings.consent.ai_profile.enabled,
    nudges: settings.consent.nudges.enabled,
  };
}

export async function updateSettings(
  ctx: ServiceContext,
  patch: UpdateSettingsInput,
): Promise<SettingsView> {
  const row = await ensureSettings(ctx.scope);
  const updated = await ctx.scope.updateById(userSettings, row.id, {
    ...(patch.timeZone !== undefined ? { timeZone: patch.timeZone } : {}),
    ...(patch.quietHoursStart !== undefined ? { quietHoursStart: patch.quietHoursStart } : {}),
    ...(patch.quietHoursEnd !== undefined ? { quietHoursEnd: patch.quietHoursEnd } : {}),
    ...(patch.firstRunCompleted !== undefined
      ? { firstRunCompleted: patch.firstRunCompleted }
      : {}),
  });
  if (!updated) throw notFound();
  return getSettings(ctx);
}

/**
 * Changes switches. A switch only gets a new "changed at" time when its value actually
 * changes, so repeating the same answer leaves the history alone.
 */
export async function updateConsent(
  ctx: ServiceContext,
  patch: UpdateConsentInput,
): Promise<SettingsView> {
  const row = await ensureSettings(ctx.scope);
  const values: Partial<typeof userSettings.$inferInsert> = {};
  if (patch.ai_features !== undefined && patch.ai_features !== row.aiFeatures) {
    values.aiFeatures = patch.ai_features;
    values.aiFeaturesChangedAt = ctx.now;
  }
  if (patch.ai_notes_journal !== undefined && patch.ai_notes_journal !== row.aiNotesJournal) {
    values.aiNotesJournal = patch.ai_notes_journal;
    values.aiNotesJournalChangedAt = ctx.now;
  }
  if (patch.ai_profile !== undefined && patch.ai_profile !== row.aiProfile) {
    values.aiProfile = patch.ai_profile;
    values.aiProfileChangedAt = ctx.now;
  }
  if (patch.nudges !== undefined && patch.nudges !== row.nudges) {
    values.nudges = patch.nudges;
    values.nudgesChangedAt = ctx.now;
  }
  if (Object.keys(values).length > 0) {
    await ctx.scope.updateById(userSettings, row.id, values);
  }
  return getSettings(ctx);
}
