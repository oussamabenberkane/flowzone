"use client";

/**
 * A small keyed cache for API data. Each screen asks for a key ("today", "inbox", "task:<id>")
 * and gets the last known answer at once, while a fresh one loads in the background
 * (stale while revalidate). Mutations update the cache optimistically, or refresh the keys
 * they affect.
 *
 * Deliberately tiny: one entry per key, no garbage collection (a personal app holds a few
 * hundred entries at most), no retries (the screens say what happened and let the person
 * try again). It replaces a data-fetching library, so there is one dependency fewer to keep.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";

export interface QueryState<T> {
  status: "loading" | "ready" | "error";
  data: T | undefined;
  error: unknown;
}

interface Entry {
  fetcher: () => Promise<unknown>;
  state: QueryState<unknown>;
  listeners: Set<() => void>;
  inflight: Promise<void> | null;
}

const LOADING: QueryState<never> = { status: "loading", data: undefined, error: null };
const store = new Map<string, Entry>();

function ensureEntry(key: string, fetcher: () => Promise<unknown>): Entry {
  let entry = store.get(key);
  if (!entry) {
    entry = { fetcher, state: LOADING, listeners: new Set(), inflight: null };
    store.set(key, entry);
  } else {
    entry.fetcher = fetcher;
  }
  return entry;
}

function setState(entry: Entry, state: QueryState<unknown>) {
  entry.state = state;
  for (const listener of entry.listeners) listener();
}

/** Loads a key now. Concurrent calls share one request. */
export function revalidate(key: string): Promise<void> {
  const entry = store.get(key);
  if (!entry) return Promise.resolve();
  if (entry.inflight) return entry.inflight;

  const previous = entry.state.data;
  setState(entry, {
    status: previous === undefined ? "loading" : "ready",
    data: previous,
    error: null,
  });

  entry.inflight = entry
    .fetcher()
    .then(
      (data) => setState(entry, { status: "ready", data, error: null }),
      (error: unknown) => setState(entry, { status: "error", data: entry.state.data, error }),
    )
    .finally(() => {
      entry.inflight = null;
    });
  return entry.inflight;
}

/** Refreshes every key that starts with one of the prefixes (for example after a change). */
export function invalidate(...prefixes: string[]): Promise<void> {
  const keys = [...store.keys()].filter((key) => prefixes.some((p) => key.startsWith(p)));
  return Promise.all(keys.map((key) => revalidate(key))).then(() => undefined);
}

/**
 * Changes a key's data at once (optimistic update). Returns the previous data so the caller
 * can put it back if the server refuses the change.
 */
export function setQueryData<T>(
  key: string,
  update: (previous: T | undefined) => T,
): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  const previous = entry.state.data as T | undefined;
  setState(entry, { status: "ready", data: update(previous), error: null });
  return previous;
}

/** Subscribes to one key and loads it on mount. The fetcher may change between renders. */
export function useQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
): QueryState<T> & {
  refresh: () => Promise<void>;
} {
  const entry = key ? ensureEntry(key, fetcher) : null;
  if (entry) entry.fetcher = fetcher;

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!entry) return () => undefined;
      entry.listeners.add(onChange);
      return () => {
        entry.listeners.delete(onChange);
      };
    },
    [entry],
  );

  const getSnapshot = useCallback(() => entry?.state ?? (LOADING as QueryState<unknown>), [entry]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (key) void revalidate(key);
  }, [key]);

  const refresh = useCallback(() => (key ? revalidate(key) : Promise.resolve()), [key]);

  return {
    status: state.status,
    data: state.data as T | undefined,
    error: state.error,
    refresh,
  };
}
