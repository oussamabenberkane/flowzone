import "server-only";
import { newToolCallId } from "./openai-compatible";
import {
  AiProviderError,
  type ChatProvider,
  type NeutralMessage,
  type ProviderEvent,
  type ProviderRequest,
  type ToolCall,
} from "./types";

/**
 * STAND-IN MODE: a deterministic stand-in for the provider. It returns scripted replies
 * and tool calls, runs through the SAME tool layer as a real model (so tiers, the action
 * log and undo are really exercised), and spends no quota. Environment-controlled
 * (AI_PROVIDER=standin) and refused in production by src/server/env.ts.
 *
 * The trigger phrases and their outputs are documented in docs/contracts/ai.md,
 * "Stand-in mode". Change both together.
 *
 * It reads the person's context from the system message that starts with CONTEXT_JSON:
 * (built by src/services/ai/context.ts), which is how it finds task ids.
 */

interface StandinContext {
  today?: string;
  tasks?: { id: string; title: string; status: string }[];
  candidates?: { id: string; title: string }[];
  reason?: string;
}

function readContext(messages: NeutralMessage[]): StandinContext {
  const system = messages.find(
    (message) => message.role === "system" && message.content.startsWith("CONTEXT_JSON:"),
  );
  if (!system || system.role !== "system") return {};
  try {
    return JSON.parse(system.content.slice("CONTEXT_JSON:".length).split("\n")[0] ?? "{}");
  } catch {
    return {};
  }
}

function lastUserText(messages: NeutralMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") return message.content.trim();
  }
  return "";
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function call(name: string, args: Record<string, unknown>): ToolCall {
  return { id: newToolCallId(), name, arguments: JSON.stringify(args) };
}

function openTasks(context: StandinContext) {
  return (context.tasks ?? []).filter((task) => task.status !== "completed");
}

function findTask(context: StandinContext, phrase: string) {
  const wanted = phrase.toLowerCase();
  return (context.tasks ?? []).find((task) => task.title.toLowerCase().includes(wanted));
}

/** The scripted reply for one chat turn, as events. */
function chatEvents(messages: NeutralMessage[]): ProviderEvent[] {
  const last = messages[messages.length - 1];
  if (last?.role === "tool") {
    let summary = "Done.";
    try {
      const parsed = JSON.parse(last.content) as { ok?: boolean; summary?: string; error?: string };
      summary = parsed.ok ? (parsed.summary ?? "Done.") : (parsed.error ?? "I couldn't do that.");
    } catch {
      summary = "Done.";
    }
    return [
      { type: "text", text: summary },
      { type: "finish", reason: "stop" },
    ];
  }

  const context = readContext(messages);
  const text = lastUserText(messages);
  const lower = text.toLowerCase();

  if (lower === "error") throw new AiProviderError("unavailable");
  if (lower === "rest") throw new AiProviderError("rate_limited");

  const toolReply = (tool: ToolCall): ProviderEvent[] => [
    { type: "tool_call", call: tool },
    { type: "finish", reason: "tool_calls" },
  ];
  const textReply = (reply: string): ProviderEvent[] => [
    { type: "text", text: reply },
    { type: "finish", reason: "stop" },
  ];

  let match: RegExpMatchArray | null;
  if ((match = text.match(/^add (.+)$/i))) {
    return toolReply(call("create_task", { title: match[1] }));
  }
  if ((match = text.match(/^note (.+)$/i))) {
    return toolReply(call("add_note", { body: match[1] }));
  }
  if ((match = text.match(/^complete (.+)$/i))) {
    const task = findTask(context, match[1] ?? "");
    if (!task) return textReply("I couldn't find that task.");
    return toolReply(call("complete_task", { taskId: task.id }));
  }
  if ((match = text.match(/^delete (.+)$/i))) {
    const task = findTask(context, match[1] ?? "");
    if (!task) return textReply("I couldn't find that task.");
    return toolReply(call("delete_task", { taskId: task.id }));
  }
  if (/^bulk complete$/i.test(text)) {
    const ids = openTasks(context)
      .map((task) => task.id)
      .slice(0, 50);
    if (ids.length === 0) return textReply("There is nothing open to complete.");
    return toolReply(call("bulk_complete_tasks", { taskIds: ids }));
  }
  if (/^plan (all|my day|today)$/i.test(text)) {
    const count = /all/i.test(text) ? 4 : 2;
    const ids = openTasks(context)
      .map((task) => task.id)
      .slice(0, count);
    if (ids.length === 0) return textReply("There is nothing open to plan.");
    return toolReply(call("move_to_today", { taskIds: ids }));
  }
  if ((match = text.match(/^break down (.+)$/i))) {
    const task = findTask(context, match[1] ?? "");
    if (!task) return textReply("I couldn't find that task.");
    return toolReply(
      call("break_down_task", {
        taskId: task.id,
        steps: ["Gather what you need", "Do the first small part", "Check it off"],
      }),
    );
  }
  if ((match = text.match(/^remember (.+)$/i))) {
    return toolReply(call("propose_profile_item", { text: match[1] }));
  }
  return textReply(
    "I can add, note, complete, delete, break down, plan or remember. Try “add buy oat milk”.",
  );
}

/** The scripted JSON reply for a feature call, or null for purposes handled as text. */
function jsonReply(purpose: ProviderRequest["purpose"], messages: NeutralMessage[]): unknown {
  const context = readContext(messages);
  const text = lastUserText(messages);
  const today = context.today ?? "2026-01-01";
  switch (purpose) {
    case "capture":
      return {
        title: text,
        dueDate: /tomorrow/i.test(text) ? addDays(today, 1) : null,
        dueTime: null,
        projectName: null,
        priority: "normal",
      };
    case "breakdown":
      return { steps: ["Gather what you need", "Do the first small part", "Check it off"] };
    case "today":
      return {
        items: (context.candidates ?? []).slice(0, 3).map((task) => ({
          taskId: task.id,
          reason: "It fits how you want to work today.",
        })),
      };
    case "fresh_look":
      return {
        options: [
          { kind: "reschedule", dueDate: addDays(today, 1), label: "Move it to tomorrow" },
          {
            kind: "simplify",
            title: (context.tasks?.[0]?.title ?? "Start small").split(" ").slice(0, 3).join(" "),
            label: "Make the title smaller",
          },
          { kind: "breakdown", label: "Break it into small steps" },
        ],
      };
    case "profile":
      return { items: ["Works best in the mornings"] };
    case "wording":
      return {
        text: `A gentle nudge: “${context.candidates?.[0]?.title ?? "a task"}”. ${context.reason ?? ""}`.trim(),
      };
    case "reflection":
      return { text: "What is one thing that went well today, even a small one?" };
    default:
      return null;
  }
}

export function standinProvider(): ChatProvider {
  return {
    name: "standin",
    async *stream(request: ProviderRequest) {
      let events: ProviderEvent[];
      if (request.purpose === "chat") {
        events = chatEvents(request.messages);
      } else {
        const reply = jsonReply(request.purpose, request.messages);
        events = [
          { type: "text", text: JSON.stringify(reply) },
          { type: "finish", reason: "stop" },
        ];
      }
      const outputChars = events
        .map((event) => (event.type === "text" ? event.text.length : 0))
        .reduce((sum, value) => sum + value, 0);
      const inputChars = request.messages.reduce(
        (sum, message) =>
          sum + ("content" in message && message.content ? message.content.length : 0),
        0,
      );
      for (const event of events) yield event;
      yield {
        type: "usage",
        inputTokens: Math.ceil(inputChars / 4),
        outputTokens: Math.ceil(outputChars / 4),
      };
    },
  };
}
