/**
 * Nudge types, response shapes and request schemas, shared by the server and the interface.
 * Owned by the Nudges agent. Contract: docs/contracts/nudges.md.
 *
 * Pure: no server imports (the browser uses these too).
 */
import { z } from "zod";

/** The three nudge types. Stable strings: they are stored in the nudge log. */
export const NUDGE_KINDS = ["due_soon", "check_in", "resurface"] as const;
export type NudgeKind = (typeof NUDGE_KINDS)[number];

/** What the push service needs in the subscription: the browser's endpoint and two keys. */
export const pushKeysSchema = z
  .object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(200),
  })
  .strict();

/** Adding this device. Subscribing again with the same endpoint updates the existing device. */
export const addDeviceBody = z
  .object({
    endpoint: z
      .string()
      .min(1)
      .max(2048)
      .refine((value) => value.startsWith("https://"), "must be a secure address"),
    keys: pushKeysSchema,
    label: z.string().trim().min(1).max(60),
  })
  .strict();

/** A per-task nudge control. Each field is optional; at least one is required. */
export const setTaskControlBody = z
  .object({
    /** true: never nudge about this task. false: nudge again. */
    muted: z.boolean().optional(),
    /** true: no nudges about this task for NUDGE_SNOOZE_DAYS. false: stop snoozing now. */
    snoozed: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.muted !== undefined || value.snoozed !== undefined, {
    message: "Say what to change.",
  });

export type AddDeviceInput = z.infer<typeof addDeviceBody>;
export type SetTaskControlInput = z.infer<typeof setTaskControlBody>;

/** GET /api/nudges/push. The public key is not secret; the private key never leaves the server. */
export interface NudgeDevicesView {
  /** False when the server has no push keys yet (the interface says so calmly). */
  configured: boolean;
  publicKey: string | null;
  devices: NudgeDeviceView[];
}

export interface NudgeDeviceView {
  id: string;
  /** A short label such as "Android · Chrome", chosen by the device. No personal data. */
  label: string;
  createdAt: string;
  lastSuccessAt: string | null;
  /** SHA-256 (hex) of the endpoint. Lets the device recognise its own entry without seeing the endpoint. */
  endpointHash: string;
}

export interface TaskNudgeControlView {
  taskId: string;
  muted: boolean;
  /** ISO timestamp until which nudges about this task are paused, or null. */
  snoozedUntil: string | null;
}

/** The answer of the tick endpoint. Counts only: no ids, no titles, no user data. */
export interface NudgeTickResultView {
  ok: true;
  /** The window this call belongs to (ISO timestamp, start of a 30-minute window). */
  window: string;
  /** How many people the run looked at. */
  evaluated: number;
  /** Nudges sent in this run. */
  sent: number;
  /** Why people were not nudged in this run, counted by reason code. */
  skipped: Record<string, number>;
}
