import "server-only";
import { logWarn } from "@/server/log";
import {
  AiProviderError,
  type ChatProvider,
  type NeutralMessage,
  type ProviderEvent,
  type ProviderRequest,
  type ToolCall,
} from "./types";

/**
 * One adapter for every provider that speaks the OpenAI-style chat completions API
 * (Groq, Mistral and OpenRouter all do). Switching provider is configuration: a base
 * URL, a key and a model name. See docs/contracts/ai.md, "Adapter".
 */

const REQUEST_TIMEOUT_MS = 25_000;
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export interface OpenAiCompatibleConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Reasoning models (Groq gpt-oss): "low" keeps the reasoning short so the answer fits the budget. */
  reasoningEffort?: "low" | "medium" | "high";
  fetchImpl?: typeof fetch;
}

/** A 9-character id. Mistral rejects other lengths, so every provider gets this shape. */
export function newToolCallId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(bytes, (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join("");
}

function toWire(message: NeutralMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
  }
  if (message.role === "assistant") {
    if (message.toolCalls && message.toolCalls.length > 0) {
      return {
        role: "assistant",
        content: message.content ?? "",
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: call.arguments },
        })),
      };
    }
    return { role: "assistant", content: message.content ?? "" };
  }
  return { role: message.role, content: message.content };
}

function finishReason(raw: unknown): "stop" | "tool_calls" | "length" | "other" {
  if (raw === "stop") return "stop";
  if (raw === "tool_calls" || raw === "function_call") return "tool_calls";
  if (raw === "length") return "length";
  return "other";
}

interface PartialToolCall {
  id?: string;
  name: string;
  arguments: string;
}

/** Reads the server-sent-event stream line by line, yielding normalized events. */
async function* readEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ProviderEvent, void, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const partials = new Map<number, PartialToolCall>();
  let reason: "stop" | "tool_calls" | "length" | "other" | undefined;
  let done = false;

  const handle = function* (line: string): Generator<ProviderEvent, void, void> {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (data === "" || data === "[DONE]") {
      if (data === "[DONE]") done = true;
      return;
    }
    let chunk: unknown;
    try {
      chunk = JSON.parse(data);
    } catch {
      throw new AiProviderError("invalid_response");
    }
    const choice = (chunk as { choices?: unknown[] })?.choices?.[0] as
      | {
          delta?: {
            content?: unknown;
            tool_calls?: {
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }[];
          };
          finish_reason?: unknown;
        }
      | undefined;
    const usage = (chunk as { usage?: { prompt_tokens?: number; completion_tokens?: number } })
      .usage;
    if (usage) {
      yield {
        type: "usage",
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
      };
    }
    if (!choice) return;
    if (typeof choice.delta?.content === "string" && choice.delta.content !== "") {
      yield { type: "text", text: choice.delta.content };
    }
    for (const part of choice.delta?.tool_calls ?? []) {
      const index = part.index ?? 0;
      const current = partials.get(index) ?? { name: "", arguments: "" };
      if (part.id) current.id = part.id;
      if (part.function?.name) current.name += part.function.name;
      if (part.function?.arguments) current.arguments += part.function.arguments;
      partials.set(index, current);
    }
    if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
      reason = finishReason(choice.finish_reason);
    }
  };

  try {
    while (!done) {
      const { value, done: ended } = await reader.read();
      if (ended) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) yield* handle(line.trim());
    }
    buffer += decoder.decode();
    if (buffer.trim() !== "") yield* handle(buffer.trim());
  } finally {
    reader.releaseLock();
  }

  const ordered = [...partials.entries()].sort(([a], [b]) => a - b).map(([, call]) => call);
  for (const call of ordered) {
    if (call.name === "") throw new AiProviderError("invalid_response");
    const toolCall: ToolCall = {
      id: call.id && /^[A-Za-z0-9]{9}$/.test(call.id) ? call.id : newToolCallId(),
      name: call.name,
      arguments: call.arguments === "" ? "{}" : call.arguments,
    };
    yield { type: "tool_call", call: toolCall };
  }
  if (ordered.length > 0 && (reason === undefined || reason === "stop")) reason = "tool_calls";
  yield { type: "finish", reason: reason ?? "other" };
}

function statusToKind(status: number): "rate_limited" | "quota" | "unavailable" {
  if (status === 429) return "rate_limited";
  if (status === 402) return "quota";
  return "unavailable";
}

export function openAiCompatibleProvider(config: OpenAiCompatibleConfig): ChatProvider {
  const fetchImpl = config.fetchImpl ?? fetch;
  return {
    name: config.name,
    async *stream(request: ProviderRequest) {
      const body: Record<string, unknown> = {
        model: config.model,
        messages: request.messages.map(toWire),
        stream: true,
        max_tokens: request.maxTokens,
        temperature: request.temperature ?? 0.3,
      };
      if (request.tools && request.tools.length > 0) {
        body.tools = request.tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        }));
      }
      if (request.json) body.response_format = { type: "json_object" };
      if (config.reasoningEffort) body.reasoning_effort = config.reasoningEffort;

      const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const signal = request.signal ? AbortSignal.any([timeout, request.signal]) : timeout;

      let response: Response;
      try {
        response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(body),
          signal,
        });
      } catch {
        // Network failure or timeout. The error text is not logged: it can echo content.
        logWarn("ai.provider_error.unreachable");
        throw new AiProviderError("unavailable");
      }

      if (!response.ok || !response.body) {
        const kind = statusToKind(response.status);
        logWarn(`ai.provider_error.${kind}`);
        // Drain the body so the connection is released; its text is never logged.
        await response.body?.cancel().catch(() => undefined);
        throw new AiProviderError(kind);
      }

      yield* readEvents(response.body);
    },
  };
}
