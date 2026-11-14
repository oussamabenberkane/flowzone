import { z } from "zod";

/**
 * The recurrence rule a task follows. Stored as JSON in the database and sent as JSON
 * in the API. Pure types and validation: no server imports (see docs/contracts/api.md).
 *
 *   { "type": "daily" }
 *   { "type": "every_n_days", "interval": 3 }            every 3 days from the start date
 *   { "type": "weekly", "days": [1, 3, 5] }              0 = Sunday … 6 = Saturday
 *   { "type": "monthly", "day": 15 }                     1–31; in shorter months the last day
 */
export type RecurrenceRule =
  | { type: "daily" }
  | { type: "every_n_days"; interval: number }
  | { type: "weekly"; days: number[] }
  | { type: "monthly"; day: number };

export const recurrenceRuleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("daily") }).strict(),
  z
    .object({
      type: z.literal("every_n_days"),
      interval: z.number().int().min(2, "must be at least 2 days").max(365),
    })
    .strict(),
  z
    .object({
      type: z.literal("weekly"),
      days: z
        .array(z.number().int().min(0).max(6))
        .min(1, "pick at least one day")
        .max(7)
        .refine((days) => new Set(days).size === days.length, "days must not repeat"),
    })
    .strict(),
  z
    .object({
      type: z.literal("monthly"),
      day: z.number().int().min(1).max(31),
    })
    .strict(),
]);

/** Keeps weekday lists in a stable order (Sunday first) so they compare equal. */
export function normalizeRecurrenceRule(rule: RecurrenceRule): RecurrenceRule {
  if (rule.type === "weekly") {
    return { type: "weekly", days: [...rule.days].sort((a, b) => a - b) };
  }
  return rule;
}
