/**
 * Request validation for the core API. Pure Zod schemas, shared by the route handlers
 * (server) and the interface (browser). Every body is strict: an unknown field is an error,
 * so a typo never silently does nothing. Rules are described in docs/contracts/api.md.
 */
import { z } from "zod";
import { clientRequestIdSchema, idempotentCreate } from "./idempotency";
import { isCalendarDate, isTimeOfDay, isValidTimeZone } from "./calendar";
import { recurrenceRuleSchema } from "./recurrence";
import {
  BREAKDOWN_MAX_STEPS,
  ENTRY_BODY_MAX_LENGTH,
  ENTRY_TITLE_MAX_LENGTH,
  ESTIMATE_MAX_MINUTES,
  ESTIMATE_MIN_MINUTES,
  FRESH_LOOK_DEFAULT_LIMIT,
  LIST_DEFAULT_LIMIT,
  LIST_MAX_LIMIT,
  PROJECT_NAME_MAX_LENGTH,
  RESURFACING_DEFAULT_LIMIT,
  RESURFACING_MAX_LIMIT,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  TITLE_MAX_LENGTH,
  TODAY_PLAN_MAX_ITEMS,
} from "./tuning";

const uuid = z.uuid({ message: "That id doesn't look right." });

const calendarDate = z
  .string()
  .refine(isCalendarDate, { message: "Use a real date in the form YYYY-MM-DD." });

const timeOfDay = z
  .string()
  .refine(isTimeOfDay, { message: "Use a time in the form HH:MM (24-hour)." });

const taskTitle = z
  .string()
  .trim()
  .min(1, { message: "Give the task a short title." })
  .max(TITLE_MAX_LENGTH, { message: `Keep the title under ${TITLE_MAX_LENGTH} characters.` });

const priority = z.enum(["low", "normal", "high"], {
  message: "Priority is low, normal or high.",
});

const energy = z.enum(["low", "medium", "high"], {
  message: "Energy is low, medium or high.",
});

const estimate = z
  .number()
  .int({ message: "Estimate is a whole number of minutes." })
  .min(ESTIMATE_MIN_MINUTES, { message: "Estimate must be at least 1 minute." })
  .max(ESTIMATE_MAX_MINUTES, { message: "Estimate must be one day (1440 minutes) or less." });

const listLimit = (max: number, fallback: number) =>
  z.coerce
    .number({ message: "Limit is a number." })
    .int({ message: "Limit is a whole number." })
    .min(1, { message: "Limit must be at least 1." })
    .max(max, { message: `Limit must be ${max} or less.` })
    .default(fallback);

const offset = z.coerce
  .number({ message: "Offset is a number." })
  .int({ message: "Offset is a whole number." })
  .min(0, { message: "Offset can't be negative." })
  .default(0);

/* ----- Recurrence ----- */

export const recurrenceInput = z
  .object({
    rule: recurrenceRuleSchema,
    /** First day the rule applies from. Defaults to the task's due date, else today. */
    startDate: calendarDate.optional(),
    /** Pause the recurrence (no current occurrence until resumed). */
    paused: z.boolean().optional(),
  })
  .strict();

/* ----- Tasks ----- */

export const createTaskSchema = z
  .object({
    title: taskTitle,
    projectId: uuid.nullish(),
    parentTaskId: uuid.nullish(),
    dueDate: calendarDate.nullish(),
    dueTime: timeOfDay.nullish(),
    priority: priority.optional(),
    energy: energy.nullish(),
    estimateMinutes: estimate.nullish(),
    recurrence: recurrenceInput.nullish(),
    status: z
      .enum(["pending", "in_progress"], { message: "A new task starts as pending or in progress." })
      .optional(),
    ...idempotentCreate,
  })
  .strict();

export const updateTaskSchema = z
  .object({
    title: taskTitle.optional(),
    status: z
      .enum(["pending", "in_progress", "completed"], {
        message: "Status is pending, in_progress or completed.",
      })
      .optional(),
    projectId: uuid.nullable().optional(),
    dueDate: calendarDate.nullable().optional(),
    dueTime: timeOfDay.nullable().optional(),
    priority: priority.optional(),
    energy: energy.nullable().optional(),
    estimateMinutes: estimate.nullable().optional(),
    /** null removes the recurrence; an object sets or changes it. */
    recurrence: recurrenceInput.nullable().optional(),
    position: z.number().int().min(0).max(1_000_000).optional(),
  })
  .strict();

export const occurrenceBody = z
  .object({
    /** The occurrence to act on: the date it shows (required for a repeating task). */
    occurrenceDate: calendarDate.optional(),
  })
  .strict();

export const snoozeBody = z
  .object({
    /** Hide the task until this day (exclusive of it). Defaults to a few days from today. */
    until: calendarDate.optional(),
  })
  .strict();

export const rescheduleBody = z
  .object({
    dueDate: calendarDate.nullable(),
    dueTime: timeOfDay.nullish(),
  })
  .strict();

export const breakdownBody = z
  .object({
    steps: z
      .array(
        z
          .object({
            title: taskTitle,
            clientRequestId: clientRequestIdSchema.optional(),
          })
          .strict(),
      )
      .min(1, { message: "Add at least one step." })
      .max(BREAKDOWN_MAX_STEPS, {
        message: `Break a task into at most ${BREAKDOWN_MAX_STEPS} steps at a time.`,
      }),
  })
  .strict();

export const listTasksQuery = z
  .object({
    /** "none" means the Inbox (tasks with no project). */
    projectId: z.union([z.literal("none"), uuid]).optional(),
    parentTaskId: uuid.optional(),
    status: z.enum(["open", "completed", "all"]).default("open"),
    limit: listLimit(LIST_MAX_LIMIT, LIST_DEFAULT_LIMIT),
    offset,
  })
  .strict();

export const inboxQuery = z
  .object({
    limit: listLimit(LIST_MAX_LIMIT, LIST_DEFAULT_LIMIT),
    offset,
  })
  .strict();

/* ----- Projects ----- */

const projectName = z
  .string()
  .trim()
  .min(1, { message: "Give the project a name." })
  .max(PROJECT_NAME_MAX_LENGTH, {
    message: `Keep the project name under ${PROJECT_NAME_MAX_LENGTH} characters.`,
  });

export const createProjectSchema = z.object({ name: projectName, ...idempotentCreate }).strict();

export const updateProjectSchema = z
  .object({
    name: projectName.optional(),
    position: z.number().int().min(0).max(1_000_000).optional(),
  })
  .strict();

/* ----- Entries ----- */

export const entryKindSchema = z.enum(["note", "journal"], {
  message: "Kind is note or journal.",
});

const entryTitle = z
  .string()
  .trim()
  .max(ENTRY_TITLE_MAX_LENGTH, {
    message: `Keep the title under ${ENTRY_TITLE_MAX_LENGTH} characters.`,
  });

const entryBody = z.string().max(ENTRY_BODY_MAX_LENGTH, {
  message: `Keep the entry under ${ENTRY_BODY_MAX_LENGTH} characters.`,
});

export const createEntrySchema = z
  .object({
    kind: entryKindSchema,
    title: entryTitle.nullish(),
    body: entryBody.optional(),
    /** Defaults to today in the owner's time zone. */
    entryDate: calendarDate.optional(),
    taskId: uuid.nullish(),
    projectId: uuid.nullish(),
    ...idempotentCreate,
  })
  .strict();

export const updateEntrySchema = z
  .object({
    kind: entryKindSchema.optional(),
    title: entryTitle.nullable().optional(),
    body: entryBody.optional(),
    entryDate: calendarDate.optional(),
    taskId: uuid.nullable().optional(),
    projectId: uuid.nullable().optional(),
  })
  .strict();

export const listEntriesQuery = z
  .object({
    kind: entryKindSchema.optional(),
    taskId: uuid.optional(),
    projectId: uuid.optional(),
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    limit: listLimit(LIST_MAX_LIMIT, LIST_DEFAULT_LIMIT),
    offset,
  })
  .strict();

/* ----- Today, plans, fresh look, resurfacing, quick-add, search ----- */

export const suggestionsQuery = z
  .object({
    /** Your energy right now. Tasks that need more energy are left out. */
    energy: energy.optional(),
  })
  .strict();

export const planBody = z
  .object({
    taskIds: z
      .array(uuid)
      .max(TODAY_PLAN_MAX_ITEMS, {
        message: `A day can hold up to ${TODAY_PLAN_MAX_ITEMS} tasks.`,
      })
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Each task can appear only once in a day's plan.",
      }),
    confirmed: z.boolean().optional(),
  })
  .strict();

export const freshLookQuery = z
  .object({ limit: listLimit(LIST_MAX_LIMIT, FRESH_LOOK_DEFAULT_LIMIT) })
  .strict();

export const resurfacingQuery = z
  .object({ limit: listLimit(RESURFACING_MAX_LIMIT, RESURFACING_DEFAULT_LIMIT) })
  .strict();

export const quickAddBody = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, { message: "Type something to add." })
      .max(500, { message: "Keep it under 500 characters." }),
  })
  .strict();

export const searchQuery = z
  .object({
    q: z
      .string()
      .trim()
      .min(1, { message: "Type what to search for." })
      .max(200, { message: "Keep the search under 200 characters." }),
    limit: listLimit(SEARCH_MAX_LIMIT, SEARCH_DEFAULT_LIMIT),
  })
  .strict();

/* ----- Settings and consent ----- */

export const updateSettingsSchema = z
  .object({
    timeZone: z
      .string()
      .refine(isValidTimeZone, { message: "Use a time zone name such as Europe/Paris." })
      .optional(),
    quietHoursStart: timeOfDay.optional(),
    quietHoursEnd: timeOfDay.optional(),
    firstRunCompleted: z.boolean().optional(),
  })
  .strict();

export const updateConsentSchema = z
  .object({
    ai_features: z.boolean().optional(),
    ai_notes_journal: z.boolean().optional(),
    ai_profile: z.boolean().optional(),
    nudges: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "Say which switch to change.",
  });

/* ----- Account ----- */

export const deleteAccountBody = z
  .object({
    /** Must be exactly DELETE. Deleting an account cannot be undone. */
    confirm: z.literal("DELETE", { message: "Type DELETE to confirm." }),
  })
  .strict();
