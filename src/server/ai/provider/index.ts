import "server-only";
import { env } from "@/server/env";
import { openAiCompatibleProvider } from "./openai-compatible";
import { standinProvider } from "./standin";
import type { ChatProvider } from "./types";

/**
 * Chooses the provider from configuration (src/server/env.ts). Switching providers is a
 * change to AI_PROVIDER / AI_API_KEY / AI_MODEL here, plus an entry below if the new
 * provider is not OpenAI-compatible. See docs/contracts/ai.md, "Provider selection".
 */

interface HostedProvider {
  baseUrl: string;
  /** Used when AI_MODEL is blank. Undefined means AI_MODEL must be set. */
  defaultModel: string | undefined;
}

export const HOSTED_PROVIDERS = {
  groq: { baseUrl: "https://api.groq.com/openai/v1", defaultModel: "openai/gpt-oss-20b" },
  mistral: { baseUrl: "https://api.mistral.ai/v1", defaultModel: "mistral-small-latest" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", defaultModel: undefined },
} as const satisfies Record<string, HostedProvider>;

let cached: ChatProvider | null | undefined;

/** The configured provider, or null when AI is off. Built once per server process. */
export function getProvider(): ChatProvider | null {
  if (cached !== undefined) return cached;
  if (env.aiProvider === "none") {
    cached = null;
  } else if (env.aiProvider === "standin") {
    cached = standinProvider();
  } else {
    const hosted = HOSTED_PROVIDERS[env.aiProvider];
    const model = env.aiModel ?? hosted.defaultModel;
    cached =
      env.aiApiKey && model
        ? openAiCompatibleProvider({
            name: env.aiProvider,
            baseUrl: hosted.baseUrl,
            apiKey: env.aiApiKey,
            model,
            reasoningEffort: env.aiProvider === "groq" ? "low" : undefined,
          })
        : null;
  }
  return cached;
}

/** The model name in use, for the contract and status display. Never a secret. */
export function activeModelName(): string | null {
  if (env.aiProvider === "none") return null;
  if (env.aiProvider === "standin") return "standin";
  return env.aiModel ?? HOSTED_PROVIDERS[env.aiProvider].defaultModel ?? null;
}
