import "server-only";
import type { z } from "zod";
import {
  AiProviderError,
  type NeutralMessage,
  type ProviderPurpose,
  collectProvider,
} from "@/server/ai/provider/types";
import { logWarn } from "@/server/log";
import type { AiAccessView, AiUnavailableReason } from "@/shared/ai";
import type { ServiceContext } from "../context";
import { gateAiRequest, recordTokens } from "./access";

/**
 * Runs one feature call that must return a JSON object, validated against a schema.
 * It passes the opt-in gate first, so every feature shares the same rules. Any failure
 * comes back as a reason code, never as an exception, so the caller can fall back.
 */

export type JsonCallResult<T> =
  { ok: true; value: T; access: AiAccessView } | { ok: false; reason: AiUnavailableReason };

export async function askForJson<S extends z.ZodType>(
  ctx: ServiceContext,
  purpose: ProviderPurpose,
  messages: NeutralMessage[],
  schema: S,
  maxTokens: number,
): Promise<JsonCallResult<z.output<S>>> {
  const gate = await gateAiRequest(ctx);
  if (!gate.ok) return { ok: false, reason: gate.reason };

  let text: string;
  try {
    const result = await collectProvider(gate.permit.provider, {
      purpose,
      messages,
      json: true,
      maxTokens,
    });
    text = result.text;
    await recordTokens(ctx, result.inputTokens, result.outputTokens);
  } catch (error) {
    if (error instanceof AiProviderError) return { ok: false, reason: "provider_down" };
    logWarn("ai.feature_failed");
    return { ok: false, reason: "provider_down" };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    logWarn("ai.invalid_json");
    return { ok: false, reason: "provider_down" };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    logWarn("ai.invalid_shape");
    return { ok: false, reason: "provider_down" };
  }
  return { ok: true, value: parsed.data, access: gate.permit.access };
}
