import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { ApiError, conflict, notFound } from "@/server/http/errors";
import { logWarn } from "@/server/log";
import { aiActionLog, aiPendingConfirmations } from "@/server/db/schema";
import type { ToolCall } from "@/server/ai/provider/types";
import {
  AI_CONFIRMATION_THRESHOLD,
  AI_PENDING_EXPIRY_HOURS,
  type AiAccessView,
  type AiActionStatus,
  type AiTier,
} from "@/shared/ai";
import { type InsertOf, patchFor } from "../db-types";
import type { ServiceContext } from "../context";
import { aiAccess } from "./access";
import { type AnyTool, type UndoOp, findTool, runUndo } from "./tools";

/**
 * The action layer: runs the tool calls a model made in one turn, decides each one's
 * risk tier in code, records every action, and handles pending confirmations, rejection,
 * undo and expiry. Contract: docs/contracts/ai.md, "Action log and confirmations".
 */

export interface ActionCard {
  id: string;
  tool: string;
  tier: AiTier;
  status: AiActionStatus;
  /** One plain sentence for the card. */
  summary: string;
  canUndo: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export interface ToolOutcome {
  /** The JSON the model reads back for this call. */
  content: string;
  card: ActionCard | null;
}

type ActionRow = typeof aiActionLog.$inferSelect;

function cardOf(row: ActionRow, expiresAt: Date | null): ActionCard {
  return {
    id: row.id,
    tool: row.tool,
    tier: row.tier,
    status: row.status,
    summary: row.summary,
    canUndo: row.status === "applied" && row.undo !== null,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function pendingSummary(tool: string, args: unknown): string {
  const ids = (args as { taskIds?: unknown[] }).taskIds;
  switch (tool) {
    case "delete_task":
      return "Delete a task";
    case "bulk_complete_tasks":
      return `Complete ${ids?.length ?? 0} tasks`;
    case "move_to_today":
      return `Add ${ids?.length ?? 0} tasks to Today`;
    case "edit_note":
      return "Change a note";
    case "delete_note":
      return "Delete a note";
    default:
      return "Confirm a change";
  }
}

async function recordAction(
  ctx: ServiceContext,
  input: {
    messageId: string | null;
    tool: string;
    tier: AiTier;
    status: AiActionStatus;
    summary: string;
    undo: UndoOp | null;
  },
): Promise<ActionRow> {
  const values = {
    messageId: input.messageId,
    tool: input.tool,
    tier: input.tier,
    status: input.status,
    summary: input.summary,
    undo: input.undo,
    resolvedAt: input.status === "pending" ? null : ctx.now,
  } satisfies InsertOf<typeof aiActionLog>;
  const { row } = await ctx.scope.create(aiActionLog, values);
  return row;
}

function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Runs the tool calls of one assistant turn. The tier is decided here: a tool that always
 * needs a tap, or any batch whose calls together change more than AI_CONFIRMATION_THRESHOLD
 * items, is stored as pending for every change in that batch. Nothing else applies.
 */
export async function runToolBatch(
  ctx: ServiceContext,
  access: AiAccessView,
  messageId: string | null,
  calls: ToolCall[],
): Promise<ToolOutcome[]> {
  type Prepared = {
    call: ToolCall;
    tool: AnyTool | undefined;
    args?: unknown;
    affected: number;
    error?: string;
  };
  const prepared: Prepared[] = calls.map((call) => {
    const tool = findTool(call.name);
    if (!tool) return { call, tool, affected: 0, error: "There is no such action." };
    if (tool.needsProfile && !access.profile) {
      return { call, tool, affected: 0, error: "The profile is switched off." };
    }
    const raw = parseArguments(call.arguments);
    if (raw === undefined)
      return { call, tool, affected: 0, error: "The details could not be read." };
    const parsed = tool.parse(raw);
    if (!parsed.ok) return { call, tool, affected: 0, error: parsed.message };
    return { call, tool, args: parsed.args, affected: parsed.affected };
  });

  const batchTotal = prepared.reduce((sum, item) => sum + (item.error ? 0 : item.affected), 0);
  const outcomes: ToolOutcome[] = [];

  for (const item of prepared) {
    const { call, tool } = item;
    if (!tool || item.error !== undefined || item.args === undefined) {
      outcomes.push({
        content: JSON.stringify({ ok: false, error: item.error ?? "Not done." }),
        card: null,
      });
      continue;
    }

    const tier: AiTier =
      tool.alwaysConfirm || batchTotal > AI_CONFIRMATION_THRESHOLD ? "confirm" : "low";

    if (tier === "confirm") {
      const row = await recordAction(ctx, {
        messageId,
        tool: tool.name,
        tier,
        status: "pending",
        summary: pendingSummary(tool.name, item.args),
        undo: null,
      });
      await ctx.scope.create(aiPendingConfirmations, {
        actionId: row.id,
        args: item.args,
        expiresAt: new Date(ctx.now.getTime() + AI_PENDING_EXPIRY_HOURS * 3_600_000),
      } satisfies InsertOf<typeof aiPendingConfirmations>);
      const expires = new Date(ctx.now.getTime() + AI_PENDING_EXPIRY_HOURS * 3_600_000);
      outcomes.push({
        content: JSON.stringify({ ok: true, status: "waiting_for_confirmation" }),
        card: cardOf(row, expires),
      });
      continue;
    }

    try {
      const result = await tool.apply(ctx, item.args, access);
      const row = await recordAction(ctx, {
        messageId,
        tool: tool.name,
        tier,
        status: "applied",
        summary: result.summary,
        undo: result.undo,
      });
      outcomes.push({
        content: JSON.stringify({ ok: true, summary: result.summary }),
        card: cardOf(row, null),
      });
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "I couldn't do that. Nothing was changed.";
      if (!(error instanceof ApiError)) logWarn("ai.tool_failed", {});
      await recordAction(ctx, {
        messageId,
        tool: call.name,
        tier,
        status: "failed",
        summary: message,
        undo: null,
      });
      outcomes.push({ content: JSON.stringify({ ok: false, error: message }), card: null });
    }
  }
  return outcomes;
}

async function expireIfNeeded(
  ctx: ServiceContext,
  action: ActionRow,
  pending: { expiresAt: Date },
) {
  if (pending.expiresAt.getTime() > ctx.now.getTime()) return false;
  await ctx.scope.updateById(
    aiActionLog,
    action.id,
    patchFor<typeof aiActionLog>({ status: "expired", resolvedAt: ctx.now }),
  );
  await ctx.scope.remove(aiPendingConfirmations, eq(aiPendingConfirmations.actionId, action.id));
  return true;
}

/** Pending actions the person has not yet answered. Expired ones are closed here. */
export async function listPendingActions(ctx: ServiceContext): Promise<ActionCard[]> {
  const actions = await ctx.scope.list(aiActionLog, {
    where: eq(aiActionLog.status, "pending"),
    orderBy: [desc(aiActionLog.createdAt)],
    limit: 50,
  });
  if (actions.length === 0) return [];
  const pendings = await ctx.scope.list(aiPendingConfirmations, {
    where: inArray(
      aiPendingConfirmations.actionId,
      actions.map((action) => action.id),
    ),
  });
  const byAction = new Map(pendings.map((pending) => [pending.actionId, pending]));
  const cards: ActionCard[] = [];
  for (const action of actions) {
    const pending = byAction.get(action.id);
    if (!pending) continue;
    if (await expireIfNeeded(ctx, action, pending)) continue;
    cards.push(cardOf(action, pending.expiresAt));
  }
  return cards;
}

/** The person's recent actions, newest first. */
export async function listActions(ctx: ServiceContext, limit: number): Promise<ActionCard[]> {
  const rows = await ctx.scope.list(aiActionLog, {
    orderBy: [desc(aiActionLog.createdAt)],
    limit,
  });
  return rows.map((row) => cardOf(row, null));
}

async function loadAction(ctx: ServiceContext, id: string): Promise<ActionRow> {
  const row = await ctx.scope.findById(aiActionLog, id);
  if (!row) throw notFound();
  return row;
}

/** Runs a pending action after the person's tap. Re-validates its stored arguments first. */
export async function confirmAction(ctx: ServiceContext, id: string): Promise<ActionCard> {
  const action = await loadAction(ctx, id);
  if (action.status !== "pending") throw conflict("That has already been dealt with.");
  const access = await aiAccess(ctx);
  if (!access.features) {
    throw conflict("AI is switched off, so this can't be confirmed. You can reject it.");
  }
  const pending = await ctx.scope.find(
    aiPendingConfirmations,
    eq(aiPendingConfirmations.actionId, id),
  );
  if (!pending) throw conflict("That has already been dealt with.");
  if (await expireIfNeeded(ctx, action, pending)) {
    throw conflict("That request has expired. Ask again if you still want it.");
  }
  const tool = findTool(action.tool);
  const parsed = tool?.parse(pending.args);
  if (!tool || !parsed || !parsed.ok) throw conflict("That request can no longer be run.");

  try {
    const result = await tool.apply(ctx, parsed.args, access);
    await ctx.scope.remove(aiPendingConfirmations, eq(aiPendingConfirmations.actionId, id));
    const updated = await ctx.scope.updateById(
      aiActionLog,
      id,
      patchFor<typeof aiActionLog>({
        status: "confirmed",
        summary: result.summary,
        resolvedAt: ctx.now,
      }),
    );
    if (!updated) throw notFound();
    return cardOf(updated, null);
  } catch (error) {
    const message =
      error instanceof ApiError ? error.message : "I couldn't do that. Nothing was changed.";
    await ctx.scope.remove(aiPendingConfirmations, eq(aiPendingConfirmations.actionId, id));
    await ctx.scope.updateById(
      aiActionLog,
      id,
      patchFor<typeof aiActionLog>({ status: "failed", summary: message, resolvedAt: ctx.now }),
    );
    if (error instanceof ApiError) throw error;
    throw conflict(message);
  }
}

export async function rejectAction(ctx: ServiceContext, id: string): Promise<ActionCard> {
  const action = await loadAction(ctx, id);
  if (action.status !== "pending") throw conflict("That has already been dealt with.");
  await ctx.scope.remove(aiPendingConfirmations, eq(aiPendingConfirmations.actionId, id));
  const updated = await ctx.scope.updateById(
    aiActionLog,
    id,
    patchFor<typeof aiActionLog>({ status: "rejected", resolvedAt: ctx.now }),
  );
  if (!updated) throw notFound();
  return cardOf(updated, null);
}

/** Reverses an applied low-tier action using the undo stored when it was applied. */
export async function undoAction(ctx: ServiceContext, id: string): Promise<ActionCard> {
  const action = await loadAction(ctx, id);
  if (action.status !== "applied" || action.undo === null) {
    throw conflict("That can't be undone.");
  }
  try {
    await runUndo(ctx, action.undo as UndoOp);
  } catch (error) {
    if (error instanceof ApiError) throw conflict("That can't be undone any more.");
    throw error;
  }
  const updated = await ctx.scope.updateById(
    aiActionLog,
    id,
    patchFor<typeof aiActionLog>({ status: "undone", resolvedAt: ctx.now }),
  );
  if (!updated) throw notFound();
  return cardOf(updated, null);
}
