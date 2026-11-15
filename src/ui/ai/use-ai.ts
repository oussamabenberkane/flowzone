"use client";

/**
 * Shared AI state for the interface. One cached status key, read by every AI surface, so a
 * switch change or a resting provider shows up everywhere at once.
 */
import { invalidate, useQuery } from "@/ui/data/query";
import { refreshTaskViews } from "@/ui/tasks/task-actions";
import { getAiStatus, type AiStatusView } from "./ai-api";

export const AI_STATUS_KEY = "ai:status";

export interface AiState {
  /** The status has loaded at least once. Until then, AI surfaces stay hidden. */
  ready: boolean;
  features: boolean;
  notesJournal: boolean;
  profile: boolean;
  /** Features are on and the AI can run right now. */
  available: boolean;
  reason: AiStatusView["reason"];
  usage: AiStatusView["usage"] | null;
}

export function useAi(): AiState {
  const status = useQuery(AI_STATUS_KEY, getAiStatus);
  const data = status.data;
  return {
    ready: data !== undefined,
    features: data?.switches.features ?? false,
    notesJournal: data?.switches.notesJournal ?? false,
    profile: data?.switches.profile ?? false,
    available: data?.available ?? false,
    reason: data?.reason ?? null,
    usage: data?.usage ?? null,
  };
}

/** Call after anything the AI did or that a switch changed: the AI keys plus every task view. */
export function afterAiChange(): Promise<void> {
  return Promise.all([
    invalidate("ai:"),
    refreshTaskViews(),
    invalidate("suggestions", "resurfacing", "entries", "settings"),
  ]).then(() => undefined);
}
