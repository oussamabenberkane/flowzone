"use client";

/**
 * The offline capture queue. A task captured with no connection is kept on the device and
 * sent when the connection returns. Nothing is lost, and nothing is duplicated:
 *
 *   - every capture has its own clientRequestId, created once and reused for every retry, so
 *     the server returns the same task instead of making a second one (docs/contracts/foundation.md, 7);
 *   - an item is removed only after the server has answered for it;
 *   - a capture typed as plain text is parsed by the server at sync time (the same deterministic
 *     parser as the quick-add box), so what was typed is what gets understood.
 *
 * The state is a tiny external store, read with useSyncExternalStore by the shell.
 */
import { useSyncExternalStore } from "react";
import { messageFor, isNetworkError } from "@/ui/api/client";
import {
  createEntry,
  createProject,
  createTask,
  parseQuickAdd,
  type CreateEntryInput,
  type CreateTaskInput,
} from "@/ui/api/resources";
import { invalidate } from "@/ui/data/query";
import { CAPTURES, clearStore, deleteOne, getAll, putOne } from "./db";

/** A note or journal entry written offline. Same shape as the API input, without the request id. */
export type EntryDraft = Omit<CreateEntryInput, "clientRequestId">;

export interface PendingCapture {
  clientRequestId: string;
  createdAt: string;
  /**
   * The signed-in person it belongs to. A device can hold captures from several accounts over
   * time, so a capture is only ever sent with the session of the account that made it.
   */
  owner: string;
  /** Text typed offline, still to be read by the parser. Null when the fields were already decided. */
  text: string | null;
  /** The fields the person reviewed (when they captured it while online). */
  fields: Omit<CreateTaskInput, "clientRequestId"> | null;
  /** A note or journal entry written offline. Set instead of text and fields. */
  entry: EntryDraft | null;
  attempts: number;
  /** A calm sentence when the server refused this capture. Null while it is simply waiting. */
  problem: string | null;
}

export interface CaptureQueueState {
  items: PendingCapture[];
  syncing: boolean;
  /** False until the device's saved captures have been read once. */
  loaded: boolean;
  /** Set when the device could not save a capture at all (for example storage is blocked). */
  storageError: string | null;
}

let state: CaptureQueueState = { items: [], syncing: false, loaded: false, storageError: null };
const listeners = new Set<() => void>();

function publish(next: Partial<CaptureQueueState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getState = () => state;
const SERVER_STATE: CaptureQueueState = {
  items: [],
  syncing: false,
  loaded: false,
  storageError: null,
};
const getServerState = () => SERVER_STATE;

export function useCaptureQueue(): CaptureQueueState {
  return useSyncExternalStore(subscribe, getState, getServerState);
}

/** The signed-in person (their user id), set by the shell from the session. */
let owner: string | null = null;

export function setCaptureOwner(id: string | null): void {
  owner = id;
  void loadCaptures().then(() => {
    if (owner !== null && navigator.onLine) void flushCaptures();
  });
}

/** Reads the saved captures of the current person from the device. Safe to call often. */
export async function loadCaptures(): Promise<void> {
  try {
    const all = await getAll<PendingCapture>(CAPTURES);
    const items = all
      .filter((item) => owner !== null && item.owner === owner)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    publish({ items, loaded: true, storageError: null });
  } catch {
    publish({ loaded: true });
  }
}

/** Removes every saved capture on this device. Used when signing out. */
export async function clearDeviceCaptures(): Promise<void> {
  try {
    await clearStore(CAPTURES);
  } finally {
    await loadCaptures();
  }
}

/**
 * Saves a capture on the device. Throws when the device cannot store it, so the caller can
 * tell the person honestly instead of pretending it was saved.
 */
export async function saveCapture(input: {
  text?: string | null;
  fields?: Omit<CreateTaskInput, "clientRequestId"> | null;
  entry?: EntryDraft | null;
  /**
   * The id the save attempt already used. Pass it when a save failed on the network, so that if
   * the server did receive the first attempt, the queued copy returns that row instead of a second one.
   */
  clientRequestId?: string;
}): Promise<PendingCapture> {
  if (owner === null) {
    throw new Error("We're still checking who is signed in. Please try again in a moment.");
  }
  const capture: PendingCapture = {
    clientRequestId: input.clientRequestId ?? crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    owner,
    text: input.text ?? null,
    fields: input.fields ?? null,
    entry: input.entry ?? null,
    attempts: 0,
    problem: null,
  };
  try {
    await putOne(CAPTURES, capture);
  } catch {
    const message =
      "This device can't keep things for later right now. Please try again when you're online.";
    publish({ storageError: message });
    throw new Error(message);
  }
  await loadCaptures();
  return capture;
}

/** Drops a capture the person has decided not to keep. */
export async function discardCapture(clientRequestId: string): Promise<void> {
  await deleteOne(CAPTURES, clientRequestId);
  await loadCaptures();
}

/** Turns the parser's answer into the fields of a task, creating its project if needed. */
async function fieldsFor(
  capture: PendingCapture,
): Promise<Omit<CreateTaskInput, "clientRequestId">> {
  if (capture.fields) return capture.fields;

  const parsed = await parseQuickAdd({ text: capture.text ?? "" });
  let projectId = parsed.projectId;
  if (!projectId && parsed.projectName) {
    // The same name the online quick-add would create. Retry-safe, like the task itself.
    const project = await createProject({
      name: parsed.projectName,
      clientRequestId: `${capture.clientRequestId}-project`,
    });
    projectId = project.id;
  }
  return {
    title: parsed.title,
    projectId,
    dueDate: parsed.dueDate,
    dueTime: parsed.dueTime,
    ...(parsed.priority ? { priority: parsed.priority } : {}),
  };
}

let flushing: Promise<void> | null = null;

/**
 * Sends every saved capture, oldest first. Stops at the first network failure (we are offline
 * again) and keeps going past a refusal, which is marked on its item for the person to review.
 */
export function flushCaptures(): Promise<void> {
  if (!flushing) {
    flushing = runFlush().finally(() => {
      flushing = null;
    });
  }
  return flushing;
}

async function runFlush(): Promise<void> {
  await loadCaptures();
  if (owner === null || state.items.length === 0) return;
  publish({ syncing: true });
  let created = 0;

  try {
    for (const capture of [...state.items]) {
      try {
        if (capture.entry) {
          // The same request id as the capture: a retry returns the entry already saved.
          await createEntry({ ...capture.entry, clientRequestId: capture.clientRequestId });
        } else {
          const fields = await fieldsFor(capture);
          await createTask({ ...fields, clientRequestId: capture.clientRequestId });
        }
        await deleteOne(CAPTURES, capture.clientRequestId);
        created += 1;
      } catch (error) {
        if (isNetworkError(error)) break;
        await putOne(CAPTURES, {
          ...capture,
          attempts: capture.attempts + 1,
          problem: messageFor(error),
        }).catch(() => undefined);
      }
      await loadCaptures();
    }
  } finally {
    await loadCaptures();
    publish({ syncing: false });
    if (created > 0) {
      await invalidate("inbox", "today", "tasks", "fresh-look", "projects", "entries", "notes");
    }
  }
}

/**
 * Starts syncing for the life of the app shell: once now, and again whenever the browser
 * comes back online. Returns a cleanup function.
 */
export function startCaptureSync(): () => void {
  const onOnline = () => void flushCaptures();
  window.addEventListener("online", onOnline);
  void loadCaptures().then(() => {
    if (navigator.onLine) void flushCaptures();
  });
  return () => window.removeEventListener("online", onOnline);
}
