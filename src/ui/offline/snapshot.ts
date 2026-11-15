"use client";

/**
 * The last Today the person saw, kept on this device so Today still shows when the connection
 * is gone. It is read-only in the interface: changes need a connection, and the screen says so.
 */
import type { FreshLookView, TodayView } from "@/shared/views";
import { clearStore, getOne, putOne, SNAPSHOTS } from "./db";

/** Removes the saved Today (used when signing out). */
export async function clearTodaySnapshots(): Promise<void> {
  try {
    await clearStore(SNAPSHOTS);
  } catch {
    // Nothing to clear if storage is blocked.
  }
}

export interface TodaySnapshot {
  key: "today";
  savedAt: string;
  today: TodayView;
  freshLook: FreshLookView;
}

export async function saveTodaySnapshot(today: TodayView, freshLook: FreshLookView): Promise<void> {
  try {
    const snapshot: TodaySnapshot = {
      key: "today",
      savedAt: new Date().toISOString(),
      today,
      freshLook,
    };
    await putOne(SNAPSHOTS, snapshot);
  } catch {
    // Storage is blocked. Today still works online; it just cannot be shown offline.
  }
}

export async function loadTodaySnapshot(): Promise<TodaySnapshot | undefined> {
  try {
    return await getOne<TodaySnapshot>(SNAPSHOTS, "today");
  } catch {
    return undefined;
  }
}
