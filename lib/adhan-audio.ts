// Adhan (call to prayer) recordings for the prayer-times page. These are
// long-standing, freely hosted call-to-prayer recordings; they stream from the
// host at play time, exactly like the qari audio — no bundle cost. Because the
// per-file muezzin attribution isn't reliably documented, they're presented
// plainly so you can listen and pick the voice you love.

export interface Adhan {
  id: string;
  name: string;
  note?: string;
  url: string;
}

const HOST = "https://www.islamcan.com/audio/adhan";

export const ADHANS: Adhan[] = [
  { id: "adhan1", name: "Adhan 1", note: "Klassisk böneutropare", url: `${HOST}/azan1.mp3` },
  { id: "adhan2", name: "Adhan 2", note: "Lugn och tydlig", url: `${HOST}/azan2.mp3` },
  { id: "adhan3", name: "Adhan 3", note: "Klar röst", url: `${HOST}/azan3.mp3` },
  { id: "adhan4", name: "Adhan 4", note: "Fyllig och varm", url: `${HOST}/azan4.mp3` },
  { id: "adhan5", name: "Adhan 5", note: "Mjuk melodi", url: `${HOST}/azan5.mp3` },
  { id: "adhan6", name: "Adhan 6", note: "Kraftfull", url: `${HOST}/azan6.mp3` },
];

export const DEFAULT_ADHAN_ID = "adhan1";

export function getAdhan(id: string | null | undefined): Adhan {
  return ADHANS.find((a) => a.id === id) ?? ADHANS[0];
}
