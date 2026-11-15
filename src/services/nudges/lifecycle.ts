import "server-only";
import { asc } from "drizzle-orm";
import { nudgeLog, nudgeTaskControls, pushSubscriptions } from "@/server/db/schema";
import type { ServiceContext } from "../context";
import type { ExportFile, LifecycleHandler } from "../lifecycle/registry";

/**
 * The Nudges domain's lifecycle handler: the nudge log, per-task nudge controls and the device
 * list. Contract: docs/contracts/api.md, section 7.
 *
 * Export never includes push endpoints or keys (they are secrets of the device). Deletion removes
 * the rows, so the server never sends to these devices again. The browser's own subscription
 * stays on the device until the browser or the person removes it; the server cannot revoke it.
 */

const JSON_INDENT = 2;

function json(value: unknown): string {
  return `${JSON.stringify(value, null, JSON_INDENT)}\n`;
}

export const nudgesLifecycleHandler: LifecycleHandler = {
  id: "nudges",
  title: "Nudges: the nudge log, per-task nudge settings and notification devices",

  async exportFiles(ctx: ServiceContext): Promise<ExportFile[]> {
    const log = await ctx.scope.list(nudgeLog, { orderBy: [asc(nudgeLog.decidedAt)] });
    const controls = await ctx.scope.list(nudgeTaskControls, { limit: 1000 });
    const devices = await ctx.scope.list(pushSubscriptions, {
      orderBy: [asc(pushSubscriptions.createdAt)],
      limit: 200,
    });

    const readable = [
      "# Nudges",
      "",
      "Each line is a nudge FlowZone decided on: when, its outcome, and the text as written.",
      "",
      ...log.map((row) => `- ${row.decidedAt.toISOString()} · ${row.outcome} · ${row.text}`),
      "",
    ];

    return [
      {
        path: "nudges/log.json",
        content: json(
          log.map((row) => ({
            kind: row.kind,
            taskId: row.taskId,
            reasonCode: row.reasonCode,
            text: row.text,
            wording: row.wording,
            outcome: row.outcome,
            localDay: row.localDay,
            decidedAt: row.decidedAt.toISOString(),
            sentAt: row.sentAt?.toISOString() ?? null,
          })),
        ),
      },
      { path: "nudges/log.md", content: `${readable.join("\n")}\n` },
      {
        path: "nudges/task-settings.json",
        content: json(
          controls.map((row) => ({
            taskId: row.taskId,
            muted: row.muted,
            snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
          })),
        ),
      },
      {
        path: "nudges/devices.json",
        content: json(
          devices.map((row) => ({
            label: row.label,
            createdAt: row.createdAt.toISOString(),
            lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
          })),
        ),
      },
    ];
  },

  async deleteData(ctx: ServiceContext): Promise<void> {
    await ctx.scope.transaction(async (scope) => {
      await scope.removeAll(nudgeLog);
      await scope.removeAll(nudgeTaskControls);
      await scope.removeAll(pushSubscriptions);
    });
  },
};
