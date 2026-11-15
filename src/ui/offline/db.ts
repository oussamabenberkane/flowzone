"use client";

/**
 * A minimal IndexedDB wrapper for the two things FlowZone keeps on the device for offline use:
 *   - "captures": tasks typed while offline, waiting to reach the server;
 *   - "snapshots": the last Today the person saw, shown read-only when offline.
 *
 * Both are per-device conveniences, not the account's data: the server is the source of truth.
 * Every call can fail (private windows, blocked storage); callers decide what to show.
 */

const DB_NAME = "flowzone";
const DB_VERSION = 1;

export const CAPTURES = "captures" as const;
export const SNAPSHOTS = "snapshots" as const;
export type StoreName = typeof CAPTURES | typeof SNAPSHOTS;

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available"));
  }
  if (!opening) {
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CAPTURES)) {
          db.createObjectStore(CAPTURES, { keyPath: "clientRequestId" });
        }
        if (!db.objectStoreNames.contains(SNAPSHOTS)) {
          db.createObjectStore(SNAPSHOTS, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        opening = null;
        reject(request.error ?? new Error("Could not open local storage"));
      };
    });
  }
  return opening;
}

async function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  action: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error ?? new Error("Local storage write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("Local storage write was cancelled"));
  });
}

export function getAll<T>(store: StoreName): Promise<T[]> {
  return run<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>);
}

export function getOne<T>(store: StoreName, key: string): Promise<T | undefined> {
  return run<T | undefined>(store, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
}

export function putOne(store: StoreName, value: object): Promise<IDBValidKey> {
  return run(store, "readwrite", (s) => s.put(value));
}

export function deleteOne(store: StoreName, key: string): Promise<undefined> {
  return run(store, "readwrite", (s) => s.delete(key));
}

export function clearStore(store: StoreName): Promise<undefined> {
  return run(store, "readwrite", (s) => s.clear());
}
