/**
 * A normalised word without its alifs and hamzas: the letters where Uthmani
 * and modern script part ways (ٱلْوَٰحِدُ / الواحد, ءَامَنُوا۟ / آمنوا,
 * ٱلْقُرْءَانُ / القرآن). Two spellings of one word share a key; two
 * different words almost never do.
 */
export function spellingKey(norm: string): string {
  return norm.replace(/[اء]/g, "");
}

/**
 * The word as modern script writes it: the dagger alif written out
 * (ٱلصِّرَٰطَ → الصراط), the waw that carries it read as alif
 * (ٱلصَّلَوٰةَ → الصلاة), the small yeh written (إِبْرَٰهِـۧمَ → إبراهيم).
 */
export function modernSpelling(uthmani: string): string {
  return uthmani.replace(/وٰ/g, "ا").replace(/ىٰ/g, "ى").replace(/ٰ/g, "ا").replace(/ۧ/g, "ي");
}
