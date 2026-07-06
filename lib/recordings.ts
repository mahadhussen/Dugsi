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

// Keep storage bounded so a phone's IndexedDB quota can't fill up (a full quota
// throws on the next write and quietly breaks saving). Three guards together:
//   - MAX_SURAHS: never keep more than this many surahs' recordings.
//   - MAX_TOTAL_BYTES: evict oldest until the whole store fits this budget.
//   - MAX_BLOB_BYTES: refuse to store a single pathological blob (e.g. a
//     recording left running) that alone would eat most of the budget.
const MAX_SURAHS = 12;
const MAX_TOTAL_BYTES = 80 * 1024 * 1024; // ~80 MB across all kept recordings
const MAX_BLOB_BYTES = 25 * 1024 * 1024; // ~25 MB for any one recording

/** Whether a single recording is small enough to be worth storing. */
export function withinBlobLimit(size: number): boolean {
  return size > 0 && size <= MAX_BLOB_BYTES;
}

/** Minimal shape the eviction decision needs — a recording's size and age. */
export interface RecordingMeta {
  surah: number;
  size: number;
  createdAt: number;
}

/**
 * Decide which surahs to evict so the store stays under both the count cap and
 * the total-bytes budget. Keeps the most recent recordings and drops the oldest
 * first. Pure (no IndexedDB) so it can be unit-tested. Returns the surah numbers
 * to delete.
 */
export function selectEvictions(
  recs: RecordingMeta[],
  maxSurahs = MAX_SURAHS,
  maxBytes = MAX_TOTAL_BYTES,
): number[] {
  // Newest-first: we keep from the top and drop the tail.
  const newestFirst = [...recs].sort((a, b) => b.createdAt - a.createdAt);
  const drop: number[] = [];
  let kept = 0;
  let bytes = 0;
  for (const r of newestFirst) {
    const size = Math.max(0, r.size);
    if (kept < maxSurahs && bytes + size <= maxBytes) {
      kept++;
      bytes += size;
    } else {
      drop.push(r.surah);
    }
  }
  return drop;
}

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
  // Skip empty or pathologically large blobs — storing a monster recording would
  // evict everything else and risk blowing the quota for one file.
  if (!available() || !withinBlobLimit(blob.size)) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ surah, blob, times, createdAt } satisfies StoredRecording);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    const all = await getAll(db);
    const drop = selectEvictions(all.map((r) => ({ surah: r.surah, size: r.blob.size, createdAt: r.createdAt })));
    if (drop.length > 0) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, "readwrite");
        for (const surahToDrop of drop) tx.objectStore(STORE).delete(surahToDrop);
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
