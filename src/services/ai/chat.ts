import "server-only";
import { desc, eq } from "drizzle-orm";
import { AiProviderError, type NeutralMessage, type ToolCall } from "@/server/ai/provider/types";
import { chatSystemPrompt } from "@/server/ai/prompts";
import { logWarn } from "@/server/log";
import { aiChatMessages } from "@/server/db/schema";
import {
  AI_CHAT_HISTORY_PAGE,
  AI_CHAT_HISTORY_WINDOW,
  AI_CHAT_MAX_TOOL_ROUNDS,
  type AiUnavailableReason,
} from "@/shared/ai";
import type { ServiceContext } from "../context";
import { gateAiRequest, recordTokens } from "./access";
import { type InsertOf, patchFor } from "../db-types";
import { type ActionCard, runToolBatch } from "./actions";
import { buildContextData, contextMessage } from "./context";
import { toolSpecsFor } from "./tools";

/**
 * The persistent chat. One continuous thread per person.
 *
 *   startChatTurn  checks the opt-in gate. If the AI cannot run it returns the reason and
 *                  nothing is sent. Otherwise it saves the person's message and returns a
 *                  stream of events for the reply.
 *   The reply is saved as it completes. If the provider fails part-way, the partial text is
 *   kept only as an incomplete message, and the person gets a calm "AI is resting" event.
 *
 * Reading and deleting history never reaches a provider, so they work with AI off.
 * Contract: docs/contracts/ai.md, "Chat".
 */

export type ChatEvent =
  | { type: "start"; messageId: string }
  | { type: "delta"; text: string }
  | { type: "action"; action: ActionCard }
  | { type: "done"; messageId: string }
  | { type: "error"; reason: AiUnavailableReason };

export type ChatTurn =
  | { kind: "unavailable"; reason: AiUnavailableReason }
  | { kind: "stream"; events: AsyncGenerator<ChatEvent, void, void> };

export interface ChatMessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  complete: boolean;
  createdAt: string;
}

type MessageRow = typeof aiChatMessages.$inferSelect;

function messageView(row: MessageRow): ChatMessageView {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    complete: row.complete,
    createdAt: row.createdAt.toISOString(),
  };
}

async function recentCompleteMessages(ctx: ServiceContext, limit: number): Promise<MessageRow[]> {
  const rows = await ctx.scope.list(aiChatMessages, {
    where: eq(aiChatMessages.complete, true),
    orderBy: [desc(aiChatMessages.createdAt)],
    limit,
  });
  return rows.reverse();
}

export async function startChatTurn(ctx: ServiceContext, text: string): Promise<ChatTurn> {
  const gate = await gateAiRequest(ctx);
  if (!gate.ok) return { kind: "unavailable", reason: gate.reason };
  const { provider, access } = gate.permit;

  const userValues = { role: "user", content: text, complete: true } satisfies InsertOf<
    typeof aiChatMessages
  >;
  await ctx.scope.create(aiChatMessages, userValues);
  const placeholder = { role: "assistant", content: "", complete: false } satisfies InsertOf<
    typeof aiChatMessages
  >;
  const { row: assistant } = await ctx.scope.create(aiChatMessages, placeholder);

  async function* run(): AsyncGenerator<ChatEvent, void, void> {
    yield { type: "start", messageId: assistant.id };
    let replyText = "";
    try {
      const data = await buildContextData(ctx, access, text);
      const history = await recentCompleteMessages(ctx, AI_CHAT_HISTORY_WINDOW);
      const messages: NeutralMessage[] = [
        { role: "system", content: chatSystemPrompt(ctx.today, ctx.timeZone) },
        contextMessage(data),
        ...history.map((row): NeutralMessage => ({ role: row.role, content: row.content })),
      ];
      const tools = toolSpecsFor(access);

      for (let round = 0; ; round += 1) {
        const calls: ToolCall[] = [];
        let roundText = "";
        for await (const event of provider.stream({
          purpose: "chat",
          messages,
          tools,
          maxTokens: 1000,
        })) {
          if (event.type === "text") {
            roundText += event.text;
            replyText += event.text;
            yield { type: "delta", text: event.text };
          } else if (event.type === "tool_call") {
            calls.push(event.call);
          } else if (event.type === "usage") {
            await recordTokens(ctx, event.inputTokens, event.outputTokens);
          }
        }
        if (calls.length === 0 || round >= AI_CHAT_MAX_TOOL_ROUNDS) break;

        messages.push({ role: "assistant", content: roundText || null, toolCalls: calls });
        const outcomes = await runToolBatch(ctx, access, assistant.id, calls);
        for (const outcome of outcomes) {
          if (outcome.card) yield { type: "action", action: outcome.card };
        }
        calls.forEach((call, index) => {
          messages.push({
            role: "tool",
            toolCallId: call.id,
            content: outcomes[index]?.content ?? JSON.stringify({ ok: false, error: "Not done." }),
          });
        });
      }

      await ctx.scope.updateById(
        aiChatMessages,
        assistant.id,
        patchFor<typeof aiChatMessages>({ content: replyText, complete: true }),
      );
      yield { type: "done", messageId: assistant.id };
    } catch (error) {
      if (!(error instanceof AiProviderError)) logWarn("ai.chat_failed");
      // Keep what was streamed (marked incomplete) or drop an empty placeholder.
      if (replyText === "") {
        await ctx.scope.removeById(aiChatMessages, assistant.id);
      } else {
        await ctx.scope.updateById(
          aiChatMessages,
          assistant.id,
          patchFor<typeof aiChatMessages>({ content: replyText, complete: false }),
        );
      }
      yield { type: "error", reason: "provider_down" };
    }
  }

  return { kind: "stream", events: run() };
}

/** The most recent messages, oldest first. Works with AI off: it never reaches a provider. */
export async function listChatHistory(
  ctx: ServiceContext,
  limit: number = AI_CHAT_HISTORY_PAGE,
): Promise<ChatMessageView[]> {
  const rows = await ctx.scope.list(aiChatMessages, {
    orderBy: [desc(aiChatMessages.createdAt)],
    limit,
  });
  return rows.reverse().map(messageView);
}

/** Deletes one message. Actions that came from it stay in the log, unlinked. */
export async function deleteChatMessage(ctx: ServiceContext, id: string): Promise<boolean> {
  return ctx.scope.removeById(aiChatMessages, id);
}

/** Deletes the whole thread. */
export async function clearChatHistory(ctx: ServiceContext): Promise<number> {
  return ctx.scope.removeAll(aiChatMessages);
}
