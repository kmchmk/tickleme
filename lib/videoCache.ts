/**
 * Caches clip files in IndexedDB so repeat visits load the avatar without
 * touching the network. Entries are keyed by URL and tagged with the avatar's
 * `version`; bump the version in the manifest after re-uploading clips.
 * Any IndexedDB failure (private mode, quota) falls back to a plain fetch.
 */

const DB_NAME = "tickleme";
const STORE = "clips";

type Entry = { version: number; blob: Blob };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = run(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

async function download(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.blob();
}

export async function getClip(url: string, version: number): Promise<Blob> {
  try {
    const hit = await tx<Entry | undefined>("readonly", (s) => s.get(url));
    if (hit && hit.version === version) return hit.blob;
  } catch {
    return download(url);
  }
  const blob = await download(url);
  tx("readwrite", (s) => s.put({ version, blob } satisfies Entry, url)).catch(() => {});
  return blob;
}
