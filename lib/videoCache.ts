/**
 * Caches clip files in IndexedDB so repeat visits load the avatar without
 * touching the network. Entries are keyed by a STABLE key from the server (the
 * download URL of private clips is signed and changes every time) and tagged
 * with the variant's `version`; bump the version after re-uploading clips.
 * Keys of private clips start with "private:" and are wiped on sign-out.
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
    req.onblocked = () => reject(new Error("indexedDB blocked"));
    setTimeout(() => reject(new Error("indexedDB timeout")), 3000); // some private modes never answer
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

/** Fetches a file, retrying network hiccups (common on phones) twice with a short back-off. */
async function download(url: string): Promise<Blob> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.blob();
      if (res.status < 500 && res.status !== 429) throw Object.assign(new Error(`${url}: ${res.status}`), { final: true });
      throw new Error(`${url}: ${res.status}`);
    } catch (e) {
      if ((e as { final?: boolean }).final || attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
}

export async function getClip(key: string, url: string, version: number): Promise<Blob> {
  try {
    const hit = await tx<Entry | undefined>("readonly", (s) => s.get(key));
    if (hit && hit.version === version) return hit.blob;
  } catch {
    return download(url);
  }
  const blob = await download(url);
  tx("readwrite", (s) => s.put({ version, blob } satisfies Entry, key)).catch(() => {});
  return blob;
}

/** Forget every cached private clip (called on sign-out so a shared device keeps nothing). */
export async function clearPrivateClips(): Promise<void> {
  try {
    const keys = await tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys());
    await Promise.all(keys.filter((k) => String(k).startsWith("private:")).map((k) => tx("readwrite", (s) => s.delete(k))));
  } catch {
    /* nothing cached, or storage unavailable */
  }
}
