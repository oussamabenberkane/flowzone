import "server-only";
import { getProvider, activeModelName } from "@/server/ai/provider";
import { env } from "@/server/env";
import type { AiAccessView, AiUnavailableReason } from "@/shared/ai";
import type { ServiceContext } from "../context";
import { aiAccess, todayUsage } from "./access";

/**
 * What the interface needs to show the AI's state: the four switches, whether the AI can
 * run right now and why not, and today's use against the cap. Nothing here is content.
 */

export interface AiStatusView {
  switches: AiAccessView;
  available: boolean;
  reason: AiUnavailableReason | null;
  provider: string;
  model: string | null;
  usage: { used: number; limit: number };
}

export async function aiStatus(ctx: ServiceContext): Promise<AiStatusView> {
  const switches = await aiAccess(ctx);
  const usage = await todayUsage(ctx);
  const provider = getProvider();
  let reason: AiUnavailableReason | null = null;
  if (!switches.features) reason = "not_opted_in";
  else if (!provider) reason = "provider_down";
  else if (usage.used >= usage.limit) reason = "daily_limit";
  return {
    switches,
    available: reason === null,
    reason,
    provider: env.aiProvider,
    model: activeModelName(),
    usage,
  };
}
