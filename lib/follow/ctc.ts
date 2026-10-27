// CTC arithmetic over a speech model's per-frame letter probabilities.
//
// A CTC model (wav2vec2) says, for every 20 ms frame, how likely each letter is
// — with no language model behind it, so it does not pull what it hears toward
// the text. From those numbers:
//   • ctcNll: how well a written text fits the audio (negative log-likelihood,
//     summed over every way the text can be laid over the frames);
//   • ctcAlign: the single best way, i.e. which frame each letter sits on;
//   • greedy: what the model heard, read straight off the frames.
// Pure functions; no model, no I/O. Tested against PyTorch's ctc_loss.

/** Per-frame log-probabilities, frames × vocab, row-major. */
export interface LogProbs {
  frames: number;
  vocab: number;
  data: Float32Array;
}

/** Turn raw model logits into per-frame log-probabilities. */
export function logSoftmax(raw: Float32Array, frames: number, vocab: number): LogProbs {
  const data = new Float32Array(frames * vocab);
  for (let t = 0; t < frames; t++) {
    const off = t * vocab;
    let mx = -Infinity;
    for (let k = 0; k < vocab; k++) if (raw[off + k] > mx) mx = raw[off + k];
    let s = 0;
    for (let k = 0; k < vocab; k++) s += Math.exp(raw[off + k] - mx);
    const lse = mx + Math.log(s);
    for (let k = 0; k < vocab; k++) data[off + k] = raw[off + k] - lse;
  }
  return { frames, vocab, data };
}

const lse2 = (a: number, b: number) => {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  return a > b ? a + Math.log1p(Math.exp(b - a)) : b + Math.log1p(Math.exp(a - b));
};

/** The label sequence with a blank between and around every letter. */
function extend(ids: readonly number[], blank: number): Int32Array {
  const ext = new Int32Array(2 * ids.length + 1).fill(blank);
  for (let i = 0; i < ids.length; i++) ext[2 * i + 1] = ids[i];
  return ext;
}

/**
 * Negative log-likelihood of `ids` given the frames (CTC forward algorithm),
 * the same number as PyTorch's ctc_loss(reduction="sum"). Infinity when the
 * text cannot fit (more letters than frames allow).
 */
export function ctcNll(lp: LogProbs, ids: readonly number[], blank: number): number {
  const { frames: T, vocab: V, data } = lp;
  const ext = extend(ids, blank);
  const S = ext.length;
  let a = new Float64Array(S).fill(-Infinity);
  let b = new Float64Array(S);
  a[0] = data[ext[0]];
  if (S > 1) a[1] = data[ext[1]];
  for (let t = 1; t < T; t++) {
    const off = t * V;
    for (let s = 0; s < S; s++) {
      let v = a[s];
      if (s > 0) v = lse2(v, a[s - 1]);
      if (s > 1 && ext[s] !== blank && ext[s] !== ext[s - 2]) v = lse2(v, a[s - 2]);
      b[s] = v === -Infinity ? -Infinity : v + data[off + ext[s]];
    }
    [a, b] = [b, a];
  }
  const ll = S > 1 ? lse2(a[S - 1], a[S - 2]) : a[0];
  return ll === -Infinity ? Infinity : -ll;
}

/**
 * The best single path (Viterbi): for each letter of `ids`, the first and last
 * frame it is spoken on, or null when the text cannot fit.
 */
export function ctcAlign(lp: LogProbs, ids: readonly number[], blank: number): { first: number[]; last: number[] } | null {
  const { frames: T, vocab: V, data } = lp;
  const ext = extend(ids, blank);
  const S = ext.length;
  const back = new Uint8Array(T * S);
  let a = new Float64Array(S).fill(-Infinity);
  let b = new Float64Array(S);
  a[0] = data[ext[0]];
  if (S > 1) a[1] = data[ext[1]];
  for (let t = 1; t < T; t++) {
    const off = t * V;
    for (let s = 0; s < S; s++) {
      let best = a[s];
      let step = 0;
      if (s > 0 && a[s - 1] > best) {
        best = a[s - 1];
        step = 1;
      }
      if (s > 1 && ext[s] !== blank && ext[s] !== ext[s - 2] && a[s - 2] > best) {
        best = a[s - 2];
        step = 2;
      }
      b[s] = best === -Infinity ? -Infinity : best + data[off + ext[s]];
      back[t * S + s] = step;
    }
    [a, b] = [b, a];
  }
  let s = S > 1 && a[S - 2] > a[S - 1] ? S - 2 : S - 1;
  if (a[s] === -Infinity) return null;
  const first = new Array<number>(ids.length).fill(-1);
  const last = new Array<number>(ids.length).fill(-1);
  for (let t = T - 1; t >= 0; t--) {
    if (s % 2 === 1) {
      const k = (s - 1) >> 1;
      first[k] = t;
      if (last[k] < 0) last[k] = t;
    }
    if (t > 0) s -= back[t * S + s];
  }
  return { first, last };
}

/** What the model heard, frame by frame: repeats merged, blanks dropped. */
export function greedy(lp: LogProbs, blank: number): number[] {
  const { frames: T, vocab: V, data } = lp;
  const out: number[] = [];
  let prev = -1;
  for (let t = 0; t < T; t++) {
    const off = t * V;
    let best = 0;
    for (let k = 1; k < V; k++) if (data[off + k] > data[off + best]) best = k;
    if (best !== prev && best !== blank) out.push(best);
    prev = best;
  }
  return out;
}
