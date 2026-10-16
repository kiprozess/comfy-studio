import type { CategoryId } from "./styling-categories";
import type { FlatlaySelection } from "./flatlay";
import type { Quality } from "./quality";
import type { OutputSize } from "./output-size";
import type { Gender, StylingChoice } from "./styling-types";

// Persisted form of a history entry: Blobs instead of object URLs, which do not survive a reload.
export type StoredHistoryEntry = {
  id: string;
  token?: string;
  createdAt?: number;
  phase: "submitting" | "queued" | "running" | "succeeded" | "failed" | "paused";
  queuePosition?: number;
  error?: string;
  image?: string;
  personFile?: Blob;
  gender?: Gender;
  /** Set when this entry upscaled an earlier result. */
  upscale?: "2k" | "4k" | "8k";
  /** Set for flat lays and for mannequin poses; try-on entries have none. */
  kind?: "flatlay" | "pose";
  parts?: FlatlaySelection;
  quality?: Quality;
  size?: OutputSize;
  items: { category: string; categoryId?: CategoryId; choice: StylingChoice }[];
};

/** A tile the user chose to keep in the sidebar; without a gender it appears in both collections. */
export type LibraryItem = {
  id: string;
  category: CategoryId;
  gender?: Gender;
  label: string;
  file: Blob;
  /** Job ticket of the result it was saved from, so a result knows it is already saved. */
  source?: string;
  createdAt: number;
};

const dbName = "comfy-stylist";
const storeName = "history";
const libraryStore = "library";

function request<T>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let database: Promise<IDBDatabase> | null = null;
function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    // Version 2 adds the library next to the history.
    const req = indexedDB.open(dbName, 2);
    req.onupgradeneeded = () => {
      for (const name of [storeName, libraryStore]) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      // Let a newer tab upgrade the schema instead of blocking it.
      req.result.onversionchange = () => { req.result.close(); database = null; };
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  }).catch((error) => { database = null; throw error; });
  return database;
}

async function transaction(mode: IDBTransactionMode, run: (store: IDBObjectStore) => void, name = storeName) {
  const tx = (await openDatabase()).transaction(name, mode);
  run(tx.objectStore(name));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

export async function loadHistory(): Promise<StoredHistoryEntry[]> {
  const store = (await openDatabase()).transaction(storeName).objectStore(storeName);
  const entries = await request(store.getAll() as IDBRequest<StoredHistoryEntry[]>);
  return entries.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export function writeHistory(put: StoredHistoryEntry[], remove: string[]) {
  return transaction("readwrite", (store) => {
    put.forEach((entry) => store.put(entry));
    remove.forEach((id) => store.delete(id));
  });
}

export async function loadLibrary(): Promise<LibraryItem[]> {
  const store = (await openDatabase()).transaction(libraryStore).objectStore(libraryStore);
  const items = await request(store.getAll() as IDBRequest<LibraryItem[]>);
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

export function saveLibraryItem(item: LibraryItem) {
  return transaction("readwrite", (store) => { store.put(item); }, libraryStore);
}

export function deleteLibraryItem(id: string) {
  return transaction("readwrite", (store) => { store.delete(id); }, libraryStore);
}
