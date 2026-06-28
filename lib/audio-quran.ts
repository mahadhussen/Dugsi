// Reference recitation audio (a qari) per ayah, for listen-and-imitate learning.
// Served from everyayah.com (a long-standing public Quran audio archive). It
// loads on the user's device at play time — no build-time dependency.

const RECITER = "Alafasy_128kbps"; // Mishary Rashid Alafasy — clear and widely used

export function ayahAudioUrl(surah: number, ayah: number): string {
  const s = String(surah).padStart(3, "0");
  const a = String(ayah).padStart(3, "0");
  return `https://everyayah.com/data/${RECITER}/${s}${a}.mp3`;
}
