import "server-only";
import { asc, desc } from "drizzle-orm";
import {
  aiActionLog,
  aiChatMessages,
  aiPendingConfirmations,
  aiProfileItems,
  aiUsageCounters,
} from "@/server/db/schema";
import type { ServiceContext } from "../context";
import type { ExportFile, LifecycleHandler } from "../lifecycle/registry";

/**
 * The AI domain's lifecycle handler: chat history, the action log, pending confirmations,
 * profile items and usage counters. Export includes readable transcripts. Deletion removes
 * every row of the person in these tables. Contract: docs/contracts/api.md, "Data lifecycle".
 */

const JSON_INDENT = 2;

function json(value: unknown): string {
  return `${JSON.stringify(value, null, JSON_INDENT)}\n`;
}

export const aiLifecycleHandler: LifecycleHandler = {
  id: "ai",
  title: "AI chat history, AI action log, profile and usage counts",

  async exportFiles(ctx: ServiceContext): Promise<ExportFile[]> {
    const messages = await ctx.scope.list(aiChatMessages, {
      orderBy: [asc(aiChatMessages.createdAt)],
    });
    const actions = await ctx.scope.list(aiActionLog, { orderBy: [asc(aiActionLog.createdAt)] });
    const profile = await ctx.scope.list(aiProfileItems, {
      orderBy: [desc(aiProfileItems.createdAt)],
    });
    const usage = await ctx.scope.list(aiUsageCounters, { orderBy: [asc(aiUsageCounters.day)] });

    const transcript = [
      "# AI chat",
      "",
      ...messages.flatMap((message) => [
        `## ${message.createdAt.toISOString()} · ${message.role === "user" ? "You" : "Assistant"}`,
        "",
        message.content.trim() === "" ? "(no text)" : message.content.trim(),
        "",
      ]),
    ];
    const profileText = [
      "# AI profile",
      "",
      ...profile.map(
        (item) =>
          `- ${item.text} (${item.status}, ${item.source === "ai" ? "suggested by the assistant" : "written by you"})`,
      ),
      "",
    ];

    return [
      {
        path: "ai/chat.json",
        content: json(
          messages.map((row) => ({
            role: row.role,
            content: row.content,
            createdAt: row.createdAt.toISOString(),
          })),
        ),
      },
      { path: "ai/chat.md", content: `${transcript.join("\n")}\n` },
      {
        path: "ai/actions.json",
        content: json(
          actions.map((row) => ({
            tool: row.tool,
            tier: row.tier,
            status: row.status,
            summary: row.summary,
            createdAt: row.createdAt.toISOString(),
            resolvedAt: row.resolvedAt?.toISOString() ?? null,
          })),
        ),
      },
      {
        path: "ai/profile.json",
        content: json(
          profile.map((row) => ({ text: row.text, source: row.source, status: row.status })),
        ),
      },
      { path: "ai/profile.md", content: `${profileText.join("\n")}\n` },
      {
        path: "ai/usage.json",
        content: json(
          usage.map((row) => ({
            day: row.day,
            requests: row.requests,
            inputTokens: row.inputTokens,
            outputTokens: row.outputTokens,
          })),
        ),
      },
    ];
  },

  async deleteData(ctx: ServiceContext): Promise<void> {
    await ctx.scope.transaction(async (scope) => {
      await scope.removeAll(aiPendingConfirmations);
      await scope.removeAll(aiActionLog);
      await scope.removeAll(aiChatMessages);
      await scope.removeAll(aiProfileItems);
      await scope.removeAll(aiUsageCounters);
    });
  },
};
