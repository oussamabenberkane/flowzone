import "server-only";

/**
 * The provider-neutral adapter. Everything the AI services need from a model provider is
 * here: streamed text, tool calls, JSON output, token usage and normalized errors. Nothing
 * outside `src/server/ai/provider/` may know which provider is behind it.
 * Contract: docs/contracts/ai.md, "Adapter".
 */

export type NeutralMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface ToolCall {
  /** 9 letters or digits. Every provider accepts this shape (Mistral requires it). */
  id: string;
  name: string;
  /** The model's JSON arguments, as text. Validated by the tool layer, never trusted. */
  arguments: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema object for the arguments. */
  parameters: Record<string, unknown>;
}

/** What the request is for. Used only to pick scripted replies in stand-in mode. */
export type ProviderPurpose =
  "chat" | "capture" | "breakdown" | "today" | "fresh_look" | "profile" | "wording" | "reflection";

export interface ProviderRequest {
  purpose: ProviderPurpose;
  messages: NeutralMessage[];
  tools?: ToolSpec[];
  /** Ask for a single JSON object as the reply (validated by the caller). */
  json?: boolean;
  maxTokens: number;
  temperature?: number;
  signal?: AbortSignal;
}

export type ProviderEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "finish"; reason: "stop" | "tool_calls" | "length" | "other" };

export interface ChatProvider {
  readonly name: string;
  stream(request: ProviderRequest): AsyncGenerator<ProviderEvent, void, void>;
}

/** Normalized failure kinds. Messages never contain prompts, replies or keys. */
export type ProviderErrorKind = "rate_limited" | "quota" | "unavailable" | "invalid_response";

export class AiProviderError extends Error {
  readonly kind: ProviderErrorKind;
  constructor(kind: ProviderErrorKind) {
    super(`AI provider error: ${kind}`);
    this.name = "AiProviderError";
    this.kind = kind;
  }
}

/** Collects a stream into text, tool calls and usage. */
export async function collectProvider(
  provider: ChatProvider,
  request: ProviderRequest,
): Promise<{
  text: string;
  toolCalls: ToolCall[];
  inputTokens: number;
  outputTokens: number;
}> {
  let text = "";
  const toolCalls: ToolCall[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  for await (const event of provider.stream(request)) {
    if (event.type === "text") text += event.text;
    else if (event.type === "tool_call") toolCalls.push(event.call);
    else if (event.type === "usage") {
      inputTokens += event.inputTokens;
      outputTokens += event.outputTokens;
    }
  }
  return { text, toolCalls, inputTokens, outputTokens };
}
