"use client";

/**
 * Loads what Today needs in one place, so the shell (for the date) and the Today screen share
 * the same cache entry. When the network is gone, the last saved Today is returned and the
 * screen says that it is showing the saved copy.
 */
import type { FreshLookView, TodayView } from "@/shared/views";
import { isNetworkError } from "@/ui/api/client";
import { getFreshLook, getToday } from "@/ui/api/resources";
import { useQuery } from "@/ui/data/query";
import { loadTodaySnapshot, saveTodaySnapshot } from "@/ui/offline/snapshot";

export interface TodayData {
  today: TodayView;
  freshLook: FreshLookView;
  /** Set when this is the saved copy from the device, shown because the network is gone. */
  savedAt: string | null;
}

export const TODAY_KEY = "today";

/** The server's "today" for this person, or null until it has loaded. */
export function useToday(): string | null {
  return useQuery(TODAY_KEY, loadToday).data?.today.date ?? null;
}

export async function loadToday(): Promise<TodayData> {
  try {
    const [today, freshLook] = await Promise.all([getToday(), getFreshLook(20)]);
    void saveTodaySnapshot(today, freshLook);
    return { today, freshLook, savedAt: null };
  } catch (error) {
    if (isNetworkError(error)) {
      const snapshot = await loadTodaySnapshot();
      if (snapshot) {
        return { today: snapshot.today, freshLook: snapshot.freshLook, savedAt: snapshot.savedAt };
      }
    }
    throw error;
  }
}
