import "server-only";
import { eq } from "drizzle-orm";
import { notFound } from "@/server/http/errors";
import { nudgeTaskControls, tasks } from "@/server/db/schema";
import { NUDGE_SNOOZE_DAYS } from "@/shared/nudge-tuning";
import type { SetTaskControlInput, TaskNudgeControlView } from "@/shared/nudges";
import type { Row } from "@/server/db/scoped";
import type { ServiceContext } from "../context";
import { type InsertOf, patchFor } from "../db-types";

/**
 * Per-task nudge controls: mute (never nudge about this task) and snooze (no nudges about it for
 * a few days). These change only nudge behaviour. The task itself is never touched.
 * Contract: docs/contracts/nudges.md, section 4.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function controlView(
  taskId: string,
  row: Row<typeof nudgeTaskControls> | null,
): TaskNudgeControlView {
  return {
    taskId,
    muted: row?.muted ?? false,
    snoozedUntil: row?.snoozedUntil?.toISOString() ?? null,
  };
}

async function requireOwnTask(ctx: ServiceContext, taskId: string): Promise<void> {
  // A task that is not this person's (or does not exist) is "not found", never a hint of which.
  const task = await ctx.scope.findById(tasks, taskId);
  if (!task) throw notFound();
}

async function currentControl(ctx: ServiceContext, taskId: string) {
  const [row] = await ctx.scope.list(nudgeTaskControls, {
    where: eq(nudgeTaskControls.taskId, taskId),
    limit: 1,
  });
  return row ?? null;
}

export async function getTaskControl(
  ctx: ServiceContext,
  taskId: string,
): Promise<TaskNudgeControlView> {
  await requireOwnTask(ctx, taskId);
  return controlView(taskId, await currentControl(ctx, taskId));
}

export async function setTaskControl(
  ctx: ServiceContext,
  taskId: string,
  input: SetTaskControlInput,
): Promise<TaskNudgeControlView> {
  await requireOwnTask(ctx, taskId);
  const current = await currentControl(ctx, taskId);

  const muted = input.muted ?? current?.muted ?? false;
  let snoozedUntil: Date | null = current?.snoozedUntil ?? null;
  if (input.snoozed === true)
    snoozedUntil = new Date(ctx.now.getTime() + NUDGE_SNOOZE_DAYS * DAY_MS);
  if (input.snoozed === false) snoozedUntil = null;

  // Nothing left to remember: remove the row rather than keep an empty one.
  if (!muted && snoozedUntil === null) {
    if (current) await ctx.scope.removeById(nudgeTaskControls, current.id);
    return controlView(taskId, null);
  }

  if (current) {
    const updated = await ctx.scope.updateById(
      nudgeTaskControls,
      current.id,
      patchFor<typeof nudgeTaskControls>({ muted, snoozedUntil }),
    );
    return controlView(taskId, updated);
  }

  // The client request id is the task, so two taps at once create one row.
  const values = { taskId, muted, snoozedUntil } satisfies InsertOf<typeof nudgeTaskControls>;
  const { row } = await ctx.scope.create(nudgeTaskControls, values, {
    clientRequestId: `nudge-control-${taskId}`,
  });
  return controlView(taskId, row);
}
