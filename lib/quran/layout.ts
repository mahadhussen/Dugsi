// The printed Madinah mushaf: 604 pages of 15 lines (pages 1 and 2 are the
// framed short pages), exactly as typeset by the King Fahd Glorious Qur'an
// Printing Complex. The data is generated from the Complex's own Word document
// of the Hafs mushaf by scripts/build-mushaf-layout.py and refers to Dugsi's
// word indexes, so the text itself never changes: only where each word sits.

import INDEX from "./layout/index.json";
import META from "./surahs-meta.json";

/** Words `from`..`to-1` of ayah `surah:ayah`; `marker` = 1 when the ayah's
 *  end marker sits right after this run on the same line. */
export type Segment = [surah: number, ayah: number, from: number, to: number, marker: 0 | 1];
/** A surah name banner, the basmala, or a line of words. */
export type Line = ["h", number] | ["b"] | Segment[];
export type Page = Line[];

export const PAGE_COUNT = 604;

const PER_FILE: number = INDEX.pagesPerFile;
const STARTS = INDEX.starts as [number, number][];
const SURAH_PAGE = INDEX.surahPage as number[];

// Global ayah ordinals so positions can be compared across surahs.
const AYAH_BASE: number[] = [];
{
  let acc = 0;
  for (const m of META as { ayahCount: number }[]) {
    AYAH_BASE.push(acc);
    acc += m.ayahCount;
  }
}
function ordinal(surah: number, ayah: number): number {
  return (AYAH_BASE[surah - 1] ?? 0) + ayah;
}
const START_ORD = STARTS.map(([s, a]) => ordinal(s, a));

/** The page on which an ayah begins. */
export function pageOf(surah: number, ayah: number): number {
  const o = ordinal(surah, ayah);
  let lo = 0;
  let hi = PAGE_COUNT - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (START_ORD[mid] <= o) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** The page on which an ayah ends (the mushaf breaks pages between ayat, so
 *  this equals pageOf; kept for callers that want the intent spelled out). */
export function lastPageOf(surah: number, ayah: number): number {
  let p = pageOf(surah, ayah);
  const o = ordinal(surah, ayah);
  while (p < PAGE_COUNT && START_ORD[p] === o) p++;
  return p;
}

/** The page that carries a surah's name banner. */
export function surahStartPage(surah: number): number {
  return SURAH_PAGE[surah - 1] ?? 1;
}

/** The surah whose banner opens on a page, if any. */
export function surahStartingOn(page: number): number | undefined {
  const i = SURAH_PAGE.indexOf(page);
  return i === -1 ? undefined : i + 1;
}

/** The first ayah with words on a page. */
export function pageStart(page: number): { surah: number; ayah: number } {
  const [surah, ayah] = STARTS[Math.max(1, Math.min(PAGE_COUNT, page)) - 1];
  return { surah, ayah };
}

export function isSegments(line: Line): line is Segment[] {
  return Array.isArray(line[0]);
}

/** Load the layout of pages `from`..`to` (inclusive); chunks are fetched on demand. */
export async function loadPages(from: number, to: number): Promise<Page[]> {
  const out: Page[] = [];
  const firstFile = Math.floor((from - 1) / PER_FILE);
  const lastFile = Math.floor((to - 1) / PER_FILE);
  for (let f = firstFile; f <= lastFile; f++) {
    const mod = await import(`./layout/pages-${f + 1}.json`);
    const chunk = mod.default as Page[];
    for (let i = 0; i < chunk.length; i++) {
      const page = f * PER_FILE + i + 1;
      if (page >= from && page <= to) out.push(chunk[i]);
    }
  }
  return out;
}

/** Every surah that has words or a banner on these pages, in order. */
export function surahsOnPages(pages: Page[]): number[] {
  const seen = new Set<number>();
  for (const page of pages) {
    for (const line of page) {
      if (isSegments(line)) for (const seg of line) seen.add(seg[0]);
      else if (line[0] === "h") seen.add(line[1]);
    }
  }
  return [...seen].sort((a, b) => a - b);
}
