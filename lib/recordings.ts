// On-device storage of your own recitation recordings, so "hear yourself" works
// when reviewing past mistakes — not just right after reciting.
//
// The audio blob never leaves the device: it's kept in IndexedDB (private to this
// browser). Every recitation is kept as its own take (not one per surah), with a
// map of reference word index → time range, so a mistake can be replayed from
// the very take in which it was made — your own mistake, not a later reading
// where you got it right. Only the most recent takes are kept so storage stays
// bounded.

export interface StoredRecording {
  surah: number;
  blob: Blob;
  /** reference word index → { start, end } seconds in the recording. */
  times: Record<number, { start: number; end: number }>;
  /** When the take was recorded; with the surah it names the take. */
  createdAt: number;
}

const DB_NAME = "dugsi-recordings";
const OLD_STORE = "recordings"; // v1: one per surah, keyed by surah
const STORE = "takes"; // v2: one per recitation, keyed by "surah:createdAt"

// Keep storage bounded so a phone's IndexedDB quota can't fill up (a full quota
// throws on the next write and quietly breaks saving). Three guards together:
//   - MAX_TAKES: never keep more than this many takes.
//   - MAX_TOTAL_BYTES: evict oldest until the whole store fits this budget.
//   - MAX_BLOB_BYTES: refuse to store a single pathological blob (e.g. a
//     recording left running) that alone would eat most of the budget.
const MAX_TAKES = 30;
const MAX_TOTAL_BYTES = 80 * 1024 * 1024; // ~80 MB across all kept recordings
const MAX_BLOB_BYTES = 25 * 1024 * 1024; // ~25 MB for any one recording

/** Whether a single recording is small enough to be worth storing. */
export function withinBlobLimit(size: number): boolean {
  return size > 0 && size <= MAX_BLOB_BYTES;
}

/** The key of one take. */
export const takeId = (surah: number, createdAt: number) => `${surah}:${createdAt}`;

/** Minimal shape the eviction decision needs — a recording's size and age. */
export interface RecordingMeta {
  surah: number;
  size: number;
  createdAt: number;
  /** The take's key; without it the surah stands for it. */
  id?: string;
}

/**
 * Decide which takes to evict so the store stays under both the count cap and
 * the total-bytes budget. Keeps the most recent recordings and drops the oldest
 * first. Pure (no IndexedDB) so it can be unit-tested. Returns the keys (the
 * take id, or the surah when there is none) to delete.
 */
export function selectEvictions(recs: (RecordingMeta & { id: string })[], maxTakes?: number, maxBytes?: number): string[];
export function selectEvictions(recs: RecordingMeta[], maxTakes?: number, maxBytes?: number): number[];
export function selectEvictions(
  recs: RecordingMeta[],
  maxTakes = MAX_TAKES,
  maxBytes = MAX_TOTAL_BYTES,
): (string | number)[] {
  // Newest-first: we keep from the top and drop the tail.
  const newestFirst = [...recs].sort((a, b) => b.createdAt - a.createdAt);
  const drop: (string | number)[] = [];
  let kept = 0;
  let bytes = 0;
  for (const r of newestFirst) {
    const size = Math.max(0, r.size);
    if (kept < maxTakes && bytes + size <= maxBytes) {
      kept++;
      bytes += size;
    } else {
      drop.push(r.id ?? r.surah);
    }
  }
  return drop;
}

function available(): boolean {
  return typeof indexedDB !== "undefined";
}

type Row = StoredRecording & { id: string };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      const tx = req.transaction!;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      // From v1 (one recording per surah): each becomes a take of its own.
      if (e.oldVersion >= 1 && db.objectStoreNames.contains(OLD_STORE)) {
        const takes = tx.objectStore(STORE);
        tx.objectStore(OLD_STORE).openCursor().onsuccess = (ev) => {
          const cur = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cur) {
            db.deleteObjectStore(OLD_STORE);
            return;
          }
          const r = cur.value as StoredRecording;
          takes.put({ ...r, id: takeId(r.surah, r.createdAt) } satisfies Row);
          cur.continue();
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAll(db: IDBDatabase): Promise<Row[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as Row[]);
    req.onerror = () => reject(req.error);
  });
}

const strip = ({ surah, blob, times, createdAt }: Row): StoredRecording => ({ surah, blob, times, createdAt });

/** Save this recitation as a take of its own, and evict the oldest beyond the caps. */
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
      tx.objectStore(STORE).put({ id: takeId(surah, createdAt), surah, blob, times, createdAt } satisfies Row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    const all = await getAll(db);
    const drop = selectEvictions(all.map((r) => ({ surah: r.surah, size: r.blob.size, createdAt: r.createdAt, id: r.id })));
    if (drop.length > 0) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, "readwrite");
        for (const id of drop) tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
    db.close();
  } catch {
    /* storage unavailable/full — reviewing yourself just won't work here */
  }
}

/** Every take kept on this device, newest first. */
export async function listTakes(): Promise<StoredRecording[]> {
  if (!available()) return [];
  try {
    const db = await openDb();
    const all = await getAll(db);
    db.close();
    return all.sort((a, b) => b.createdAt - a.createdAt).map(strip);
  } catch {
    return [];
  }
}

/** The newest take of a surah on this device, or null. */
export async function loadRecording(surah: number): Promise<StoredRecording | null> {
  return (await listTakes()).find((r) => r.surah === surah) ?? null;
}

/** The newest take of each surah, newest first (one row per surah). */
export async function listRecordings(): Promise<StoredRecording[]> {
  const seen = new Set<number>();
  return (await listTakes()).filter((r) => !seen.has(r.surah) && (seen.add(r.surah), true));
}

/** Remove every take of one surah from this device. */
export async function deleteRecording(surah: number): Promise<void> {
  if (!available()) return;
  try {
    const db = await openDb();
    const ids = (await getAll(db)).filter((r) => r.surah === surah).map((r) => r.id);
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      for (const id of ids) tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    /* ignore */
  }
}
