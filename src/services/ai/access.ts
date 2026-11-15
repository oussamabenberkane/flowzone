import "server-only";
import { eq } from "drizzle-orm";
import { type ChatProvider } from "@/server/ai/provider/types";
import { getProvider } from "@/server/ai/provider";
import { env } from "@/server/env";
import { aiUsageCounters } from "@/server/db/schema";
import { type InsertOf, patchFor } from "../db-types";
import type { AiAccessView, AiUnavailableReason } from "@/shared/ai";
import type { ServiceContext } from "../context";
import { consentSwitches } from "../settings";

/**
 * THE opt-in gate. Every AI entry point calls `gateAiRequest` before it builds any
 * context or calls a provider. Order, always the same:
 *
 *   1. ai_features is on (otherwise: not_opted_in). Nothing is read for the AI.
 *   2. A provider is configured (otherwise: provider_down).
 *   3. The person is under today's request cap (otherwise: daily_limit).
 *
 * On success one request is counted. The per-category switches (ai_notes_journal,
 * ai_profile) are read here too, and callers leave out anything their switch forbids.
 * Contract: docs/contracts/ai.md, "Opt-in enforcement".
 */

export interface AiCallPermit {
  provider: ChatProvider;
  access: AiAccessView;
}

export type AiGate =
  { ok: true; permit: AiCallPermit } | { ok: false; reason: AiUnavailableReason };

export async function aiAccess(ctx: ServiceContext): Promise<AiAccessView> {
  const switches = await consentSwitches(ctx);
  return {
    features: switches.ai_features,
    notesJournal: switches.ai_notes_journal,
    profile: switches.ai_profile,
  };
}

async function reserveRequest(ctx: ServiceContext): Promise<boolean> {
  const day = ctx.today;
  // One row per person per day. The request id is derived from the day, so creating it twice is safe.
  const values = {
    day,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
  } satisfies InsertOf<typeof aiUsageCounters>;
  const { row } = await ctx.scope.create(aiUsageCounters, values, {
    clientRequestId: `usage-${day}`,
  });
  if (row.requests >= env.aiDailyRequestLimit) return false;
  await ctx.scope.updateById(
    aiUsageCounters,
    row.id,
    patchFor<typeof aiUsageCounters>({ requests: row.requests + 1 }),
  );
  return true;
}

export async function gateAiRequest(ctx: ServiceContext): Promise<AiGate> {
  const access = await aiAccess(ctx);
  if (!access.features) return { ok: false, reason: "not_opted_in" };
  const provider = getProvider();
  if (!provider) return { ok: false, reason: "provider_down" };
  if (!(await reserveRequest(ctx))) return { ok: false, reason: "daily_limit" };
  return { ok: true, permit: { provider, access } };
}

/** Adds the tokens a provider reported to today's counters. Counts only; never content. */
export async function recordTokens(
  ctx: ServiceContext,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  if (inputTokens === 0 && outputTokens === 0) return;
  const [row] = await ctx.scope.list(aiUsageCounters, {
    where: eq(aiUsageCounters.day, ctx.today),
    limit: 1,
  });
  if (!row) return;
  await ctx.scope.updateById(
    aiUsageCounters,
    row.id,
    patchFor<typeof aiUsageCounters>({
      inputTokens: row.inputTokens + inputTokens,
      outputTokens: row.outputTokens + outputTokens,
    }),
  );
}

/** Today's use against the cap, for the status screen. */
export async function todayUsage(ctx: ServiceContext): Promise<{ used: number; limit: number }> {
  const [row] = await ctx.scope.list(aiUsageCounters, {
    where: eq(aiUsageCounters.day, ctx.today),
    limit: 1,
  });
  return { used: row?.requests ?? 0, limit: env.aiDailyRequestLimit };
}
