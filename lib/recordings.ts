// On-device storage of your own recitation recordings, so "hear yourself" works
// when reviewing past mistakes — not just right after reciting.
//
// The audio blob never leaves the device: it's kept in IndexedDB (private to this
// browser). We store, per surah, the latest recording plus a map of reference
// word index → time range, so the mistake review can replay just the word you
// missed. Only the most recent few surahs are kept so storage stays bounded.

export interface StoredRecording {
  surah: number;
  blob: Blob;
  /** reference word index → { start, end } seconds in the recording. */
  times: Record<number, { start: number; end: number }>;
  createdAt: number;
}

const DB_NAME = "dugsi-recordings";
const STORE = "recordings";
const MAX_SURAHS = 12;

function available(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "surah" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAll(db: IDBDatabase): Promise<StoredRecording[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as StoredRecording[]);
    req.onerror = () => reject(req.error);
  });
}

/** Save (replacing) this surah's recording, and evict the oldest beyond the cap. */
export async function saveRecording(
  surah: number,
  blob: Blob,
  times: Record<number, { start: number; end: number }>,
  createdAt: number,
): Promise<void> {
  if (!available() || blob.size === 0) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ surah, blob, times, createdAt } satisfies StoredRecording);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    const all = await getAll(db);
    if (all.length > MAX_SURAHS) {
      const drop = all.sort((a, b) => a.createdAt - b.createdAt).slice(0, all.length - MAX_SURAHS);
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, "readwrite");
        for (const r of drop) tx.objectStore(STORE).delete(r.surah);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
    db.close();
  } catch {
    /* storage unavailable/full — reviewing yourself just won't work here */
  }
}

/** The stored recording for a surah, or null if none on this device. */
export async function loadRecording(surah: number): Promise<StoredRecording | null> {
  if (!available()) return null;
  try {
    const db = await openDb();
    const rec = await new Promise<StoredRecording | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(surah);
      req.onsuccess = () => resolve(req.result as StoredRecording | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rec ?? null;
  } catch {
    return null;
  }
}
