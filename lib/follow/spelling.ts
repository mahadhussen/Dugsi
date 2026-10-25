/**
 * A normalised word without its alifs and hamzas: the letters where Uthmani
 * and modern script part ways (ٱلْوَٰحِدُ / الواحد, ءَامَنُوا۟ / آمنوا,
 * ٱلْقُرْءَانُ / القرآن). Two spellings of one word share a key; two
 * different words almost never do.
 */
export function spellingKey(norm: string): string {
  return norm.replace(/[اء]/g, "");
}
