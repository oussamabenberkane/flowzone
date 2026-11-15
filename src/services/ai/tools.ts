import "server-only";
import { z } from "zod";
import { ApiError, validationFailed } from "@/server/http/errors";
import { projects, tasks } from "@/server/db/schema";
import type { ToolSpec } from "@/server/ai/provider/types";
import { isCalendarDate, isTimeOfDay } from "@/shared/calendar";
import type { AiAccessView } from "@/shared/ai";
import {
  BREAKDOWN_MAX_STEPS,
  ENTRY_BODY_MAX_LENGTH,
  ENTRY_TITLE_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  TODAY_PLAN_MAX_ITEMS,
} from "@/shared/tuning";
import type { ServiceContext } from "../context";
import { createEntry, deleteEntry, updateEntry } from "../entries";
import { createProfileItem, deleteProfileItem } from "./profile";
import {
  breakDownTask,
  completeTask,
  createTask,
  deleteTask,
  getTaskDetail,
  loadTask,
  rescheduleTask,
  updateTask,
  type UpdateTaskInput,
} from "../tasks";
import { getPlan, putPlan } from "../today";

/**
 * THE tool layer. Every change the AI can make is one of the tools below, and each tool
 * calls the Backend's service layer (so every rule applies once). The RISK TIER is decided
 * here, in code, from the tool and the size of the batch. The model cannot choose it.
 *
 *   low      applied at once, with an undo where one exists
 *   confirm  stored as pending until the person taps Confirm
 *
 * Contract: docs/contracts/ai.md, "Tools and risk tiers".
 */

/** How to reverse an applied action. Stored in the action log as JSON. */
export type UndoOp =
  | { op: "delete_task"; id: string }
  | { op: "delete_tasks"; ids: string[] }
  | { op: "restore_task"; id: string; fields: UpdateTaskInput }
  | { op: "reschedule"; id: string; dueDate: string | null; dueTime: string | null }
  | { op: "plan"; date: string; taskIds: string[] }
  | { op: "delete_entry"; id: string }
  | { op: "delete_profile_item"; id: string };

export interface ApplyResult {
  /** One plain sentence for the action card. */
  summary: string;
  undo: UndoOp | null;
}

/** A tool with its schema erased, so the registry can hold all of them together. */
export interface AnyTool {
  readonly name: string;
  readonly alwaysConfirm: boolean;
  readonly needsProfile: boolean;
  readonly spec: ToolSpec;
  /** Validates raw arguments and counts how many items they would change. */
  parse(
    raw: unknown,
  ): { ok: true; args: unknown; affected: number } | { ok: false; message: string };
  apply(ctx: ServiceContext, args: unknown, access: AiAccessView): Promise<ApplyResult>;
}

const dateString = z.string().refine(isCalendarDate, "Use a date like 2026-11-20.");
const timeString = z.string().refine(isTimeOfDay, "Use a time like 17:30.");
const uuidString = z.uuid({ message: "Use the task id from the context." });
const titleString = z.string().trim().min(1, "Give it a short title.").max(TITLE_MAX_LENGTH);
const projectNameString = z.string().trim().min(1).max(PROJECT_NAME_MAX_LENGTH);
const priorityEnum = z.enum(["low", "normal", "high"]);
const energyEnum = z.enum(["low", "medium", "high"]);

function tool<S extends z.ZodType>(spec: {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  schema: S;
  affected: (args: z.output<S>) => number;
  alwaysConfirm?: boolean;
  needsProfile?: boolean;
  apply: (ctx: ServiceContext, args: z.output<S>, access: AiAccessView) => Promise<ApplyResult>;
}): AnyTool {
  return {
    name: spec.name,
    alwaysConfirm: spec.alwaysConfirm ?? false,
    needsProfile: spec.needsProfile ?? false,
    spec: { name: spec.name, description: spec.description, parameters: spec.parameters },
    parse(raw) {
      const parsed = spec.schema.safeParse(raw);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const field = issue?.path.map(String).join(".") ?? "arguments";
        return { ok: false, message: `That didn't fit: ${field}. ${issue?.message ?? ""}`.trim() };
      }
      return { ok: true, args: parsed.data, affected: spec.affected(parsed.data) };
    },
    apply(ctx, args, access) {
      return spec.apply(ctx, spec.schema.parse(args) as z.output<S>, access);
    },
  };
}

/** Finds a project by name (case-insensitive). Unknown names are a clear validation error. */
async function resolveProjectId(ctx: ServiceContext, name: string): Promise<string> {
  const all = await ctx.scope.list(projects, { limit: 200 });
  const wanted = name.toLowerCase();
  const found = all.find((project) => project.name.toLowerCase() === wanted);
  if (!found) {
    throw validationFailed([{ field: "projectName", message: `No project named “${name}”.` }]);
  }
  return found.id;
}

const taskIdParam = { taskId: { type: "string", description: "A task id from CONTEXT_JSON." } };

export const TOOLS: readonly AnyTool[] = [
  tool({
    name: "create_task",
    description: "Create a new task. Use when the person asks to add something to do.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        dueDate: { type: ["string", "null"], description: "YYYY-MM-DD or null" },
        dueTime: { type: ["string", "null"], description: "HH:MM or null" },
        projectName: { type: ["string", "null"] },
        priority: { type: "string", enum: ["low", "normal", "high"] },
      },
      required: ["title"],
      additionalProperties: false,
    },
    schema: z
      .object({
        title: titleString,
        dueDate: dateString.nullish(),
        dueTime: timeString.nullish(),
        projectName: projectNameString.nullish(),
        priority: priorityEnum.nullish(),
      })
      .strict(),
    affected: () => 1,
    async apply(ctx, args) {
      const projectId = args.projectName ? await resolveProjectId(ctx, args.projectName) : null;
      const { task } = await createTask(ctx, {
        title: args.title,
        dueDate: args.dueDate ?? null,
        dueTime: args.dueTime ?? null,
        projectId,
        priority: args.priority ?? undefined,
      });
      return {
        summary: `Added “${task.title}”${task.dueDate ? ` for ${task.dueDate}` : ""}.`,
        undo: { op: "delete_task", id: task.id },
      };
    },
  }),

  tool({
    name: "update_task",
    description:
      "Change fields of one task: title, date, time, priority, energy or project. Only the fields given change.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        title: { type: "string" },
        dueDate: { type: ["string", "null"] },
        dueTime: { type: ["string", "null"] },
        priority: { type: "string", enum: ["low", "normal", "high"] },
        energy: { type: ["string", "null"], enum: ["low", "medium", "high", null] },
        projectName: { type: ["string", "null"], description: "null removes the project" },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    schema: z
      .object({
        taskId: uuidString,
        title: titleString.optional(),
        dueDate: dateString.nullable().optional(),
        dueTime: timeString.nullable().optional(),
        priority: priorityEnum.optional(),
        energy: energyEnum.nullable().optional(),
        projectName: projectNameString.nullable().optional(),
      })
      .strict(),
    affected: () => 1,
    async apply(ctx, args) {
      const row = await loadTask(ctx, args.taskId);
      const before: UpdateTaskInput = {};
      const patch: UpdateTaskInput = {};
      if (args.title !== undefined) {
        before.title = row.title;
        patch.title = args.title;
      }
      if (args.dueDate !== undefined && row.recurrenceRule === null) {
        before.dueDate = row.dueDate;
        patch.dueDate = args.dueDate;
      }
      if (args.dueTime !== undefined) {
        before.dueTime = row.dueTime;
        patch.dueTime = args.dueTime;
      }
      if (args.priority !== undefined) {
        before.priority = row.priority;
        patch.priority = args.priority;
      }
      if (args.energy !== undefined) {
        before.energy = row.energy;
        patch.energy = args.energy;
      }
      if (args.projectName !== undefined) {
        before.projectId = row.projectId;
        patch.projectId =
          args.projectName === null ? null : await resolveProjectId(ctx, args.projectName);
      }
      const updated = await updateTask(ctx, args.taskId, patch);
      return {
        summary: `Updated “${updated.title}”.`,
        undo:
          Object.keys(before).length > 0
            ? { op: "restore_task", id: args.taskId, fields: before }
            : null,
      };
    },
  }),

  tool({
    name: "complete_task",
    description: "Mark one task as done. Not for repeating tasks.",
    parameters: {
      type: "object",
      properties: taskIdParam,
      required: ["taskId"],
      additionalProperties: false,
    },
    schema: z.object({ taskId: uuidString }).strict(),
    affected: () => 1,
    async apply(ctx, args) {
      const row = await loadTask(ctx, args.taskId);
      if (row.recurrenceRule !== null) {
        throw new ApiError(
          "conflict",
          "A repeating task is completed with its own button, not from chat.",
        );
      }
      if (row.status === "completed") {
        return { summary: `“${row.title}” was already done.`, undo: null };
      }
      await completeTask(ctx, args.taskId, {});
      return {
        summary: `Completed “${row.title}”.`,
        undo: { op: "restore_task", id: args.taskId, fields: { status: row.status } },
      };
    },
  }),

  tool({
    name: "reschedule_task",
    description:
      "Move one task to another date (and optionally time), or remove its date with null.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        dueDate: { type: ["string", "null"] },
        dueTime: { type: ["string", "null"] },
      },
      required: ["taskId", "dueDate"],
      additionalProperties: false,
    },
    schema: z
      .object({ taskId: uuidString, dueDate: dateString.nullable(), dueTime: timeString.nullish() })
      .strict(),
    affected: () => 1,
    async apply(ctx, args) {
      const row = await loadTask(ctx, args.taskId);
      await rescheduleTask(ctx, args.taskId, { dueDate: args.dueDate, dueTime: args.dueTime });
      return {
        summary: args.dueDate
          ? `Moved “${row.title}” to ${args.dueDate}.`
          : `Removed the date from “${row.title}”.`,
        undo: {
          op: "reschedule",
          id: args.taskId,
          dueDate: row.dueDate,
          dueTime: row.dueTime,
        },
      };
    },
  }),

  tool({
    name: "move_to_today",
    description: "Add tasks to today's plan. The plan is not confirmed by this.",
    parameters: {
      type: "object",
      properties: {
        taskIds: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: TODAY_PLAN_MAX_ITEMS,
        },
      },
      required: ["taskIds"],
      additionalProperties: false,
    },
    schema: z.object({ taskIds: z.array(uuidString).min(1).max(TODAY_PLAN_MAX_ITEMS) }).strict(),
    affected: (args) => args.taskIds.length,
    async apply(ctx, args) {
      const today = ctx.today;
      const current = (await getPlan(ctx, today)).tasks.map((task) => task.id);
      const merged = [...current, ...args.taskIds.filter((id) => !current.includes(id))];
      if (merged.length > TODAY_PLAN_MAX_ITEMS) {
        throw validationFailed([
          {
            field: "taskIds",
            message: `Today holds up to ${TODAY_PLAN_MAX_ITEMS} tasks. Take one off first.`,
          },
        ]);
      }
      await putPlan(ctx, today, { taskIds: merged });
      const count = args.taskIds.length;
      return {
        summary: `Added ${count} ${count === 1 ? "task" : "tasks"} to Today.`,
        undo: { op: "plan", date: today, taskIds: current },
      };
    },
  }),

  tool({
    name: "add_subtask",
    description: "Add a small step under a main task.",
    parameters: {
      type: "object",
      properties: { parentTaskId: { type: "string" }, title: { type: "string" } },
      required: ["parentTaskId", "title"],
      additionalProperties: false,
    },
    schema: z.object({ parentTaskId: uuidString, title: titleString }).strict(),
    affected: () => 1,
    async apply(ctx, args) {
      const { task } = await createTask(ctx, {
        title: args.title,
        parentTaskId: args.parentTaskId,
      });
      return {
        summary: `Added the step “${task.title}”.`,
        undo: { op: "delete_task", id: task.id },
      };
    },
  }),

  tool({
    name: "add_note",
    description: "Save a short note, optionally linked to a task.",
    parameters: {
      type: "object",
      properties: {
        body: { type: "string" },
        title: { type: ["string", "null"] },
        taskId: { type: ["string", "null"] },
      },
      required: ["body"],
      additionalProperties: false,
    },
    schema: z
      .object({
        body: z.string().trim().min(1).max(ENTRY_BODY_MAX_LENGTH),
        title: z.string().trim().min(1).max(ENTRY_TITLE_MAX_LENGTH).nullish(),
        taskId: uuidString.nullish(),
      })
      .strict(),
    affected: () => 1,
    async apply(ctx, args) {
      const { entry } = await createEntry(ctx, {
        kind: "note",
        body: args.body,
        title: args.title ?? null,
        taskId: args.taskId ?? null,
        projectId: null,
      });
      return { summary: "Saved a note.", undo: { op: "delete_entry", id: entry.id } };
    },
  }),

  tool({
    name: "break_down_task",
    description:
      "Split one main task into small steps (subtasks). Use when the person asks for help starting it.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        steps: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: BREAKDOWN_MAX_STEPS,
        },
      },
      required: ["taskId", "steps"],
      additionalProperties: false,
    },
    schema: z
      .object({
        taskId: uuidString,
        steps: z.array(titleString).min(1).max(BREAKDOWN_MAX_STEPS),
      })
      .strict(),
    affected: () => 1,
    async apply(ctx, args) {
      const before = await getTaskDetail(ctx, args.taskId);
      const previous = new Set(before.subtasks.map((task) => task.id));
      const after = await breakDownTask(ctx, args.taskId, {
        steps: args.steps.map((title) => ({ title })),
      });
      const created = after.subtasks
        .filter((task) => !previous.has(task.id))
        .map((task) => task.id);
      return {
        summary: `Broke “${after.title}” into ${created.length} steps.`,
        undo: created.length > 0 ? { op: "delete_tasks", ids: created } : null,
      };
    },
  }),

  tool({
    name: "delete_task",
    description: "Delete one task for good. Always waits for the person to confirm.",
    parameters: {
      type: "object",
      properties: taskIdParam,
      required: ["taskId"],
      additionalProperties: false,
    },
    schema: z.object({ taskId: uuidString }).strict(),
    affected: () => 1,
    alwaysConfirm: true,
    async apply(ctx, args) {
      const row = await loadTask(ctx, args.taskId);
      await deleteTask(ctx, args.taskId);
      return { summary: `Deleted “${row.title}”.`, undo: null };
    },
  }),

  tool({
    name: "bulk_complete_tasks",
    description: "Mark several tasks as done at once. Always waits for the person to confirm.",
    parameters: {
      type: "object",
      properties: {
        taskIds: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 50 },
      },
      required: ["taskIds"],
      additionalProperties: false,
    },
    schema: z.object({ taskIds: z.array(uuidString).min(1).max(50) }).strict(),
    affected: (args) => args.taskIds.length,
    alwaysConfirm: true,
    async apply(ctx, args) {
      let done = 0;
      for (const id of args.taskIds) {
        const row = await ctx.scope.findById(tasks, id);
        if (!row || row.recurrenceRule !== null || row.status === "completed") continue;
        await completeTask(ctx, id, {});
        done += 1;
      }
      return {
        summary: `Completed ${done} ${done === 1 ? "task" : "tasks"}.`,
        undo: null,
      };
    },
  }),

  tool({
    name: "edit_note",
    description:
      "Change the title or text of a note or journal entry. Always waits for the person to confirm.",
    parameters: {
      type: "object",
      properties: {
        entryId: { type: "string" },
        title: { type: ["string", "null"] },
        body: { type: "string" },
      },
      required: ["entryId"],
      additionalProperties: false,
    },
    schema: z
      .object({
        entryId: uuidString,
        title: z.string().trim().min(1).max(ENTRY_TITLE_MAX_LENGTH).nullable().optional(),
        body: z.string().max(ENTRY_BODY_MAX_LENGTH).optional(),
      })
      .strict(),
    affected: () => 1,
    alwaysConfirm: true,
    async apply(ctx, args) {
      const { entryId, ...patch } = args;
      await updateEntry(ctx, entryId, patch);
      return { summary: "Changed a note.", undo: null };
    },
  }),

  tool({
    name: "delete_note",
    description: "Delete a note or journal entry. Always waits for the person to confirm.",
    parameters: {
      type: "object",
      properties: { entryId: { type: "string" } },
      required: ["entryId"],
      additionalProperties: false,
    },
    schema: z.object({ entryId: uuidString }).strict(),
    affected: () => 1,
    alwaysConfirm: true,
    async apply(ctx, args) {
      await deleteEntry(ctx, args.entryId);
      return { summary: "Deleted a note.", undo: null };
    },
  }),

  tool({
    name: "propose_profile_item",
    description:
      "Suggest one short, stable fact about how the person works. It is only a proposal until they accept it.",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
      additionalProperties: false,
    },
    schema: z.object({ text: z.string().trim().min(1).max(200) }).strict(),
    affected: () => 0,
    needsProfile: true,
    async apply(ctx, args, access) {
      if (!access.profile) {
        throw validationFailed([{ field: "text", message: "The profile is switched off." }]);
      }
      const item = await createProfileItem(ctx, {
        text: args.text,
        source: "ai",
        status: "proposed",
      });
      return {
        summary: `Suggested a profile note: “${item.text}”.`,
        undo: { op: "delete_profile_item", id: item.id },
      };
    },
  }),
];

export function findTool(name: string): AnyTool | undefined {
  return TOOLS.find((candidate) => candidate.name === name);
}

/** The tool specs the model may see. The profile tool is left out when ai_profile is off. */
export function toolSpecsFor(access: AiAccessView): ToolSpec[] {
  return TOOLS.filter((candidate) => !candidate.needsProfile || access.profile).map(
    (candidate) => candidate.spec,
  );
}

/** Reverses an applied low-tier action. */
export async function runUndo(ctx: ServiceContext, undo: UndoOp): Promise<void> {
  switch (undo.op) {
    case "delete_task":
      await deleteTask(ctx, undo.id);
      return;
    case "delete_tasks":
      for (const id of undo.ids) await deleteTask(ctx, id);
      return;
    case "restore_task":
      await updateTask(ctx, undo.id, undo.fields);
      return;
    case "reschedule":
      await rescheduleTask(ctx, undo.id, { dueDate: undo.dueDate, dueTime: undo.dueTime });
      return;
    case "plan":
      await putPlan(ctx, undo.date, { taskIds: undo.taskIds });
      return;
    case "delete_entry":
      await deleteEntry(ctx, undo.id);
      return;
    case "delete_profile_item":
      await deleteProfileItem(ctx, undo.id);
      return;
  }
}
