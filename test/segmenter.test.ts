import { test } from "node:test";
import assert from "node:assert/strict";
import { Segmenter, segmentAll } from "../lib/listen/segmenter";

const SR = 16000;
/** A "voice" (tone with some wobble) of `sec` seconds at amplitude `amp`. */
function voice(sec: number, amp = 0.2, f = 220): Float32Array {
  const n = Math.round(sec * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * f * i) / SR) * (0.8 + 0.2 * Math.sin((2 * Math.PI * 3 * i) / SR));
  return out;
}
function quiet(sec: number, amp = 0.001): Float32Array {
  const n = Math.round(sec * SR);
  const out = new Float32Array(n);
  let x = 12345;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    out[i] = amp * ((x / 0x7fffffff) * 2 - 1);
  }
  return out;
}
function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
const pieces = (pcm: Float32Array, opts = {}) => segmentAll(pcm, opts).flatMap((e) => (e.type === "segment" ? [e.segment] : []));

test("three verses with pauses between them become three pieces", () => {
  const pcm = concat(quiet(0.5), voice(3), quiet(0.7), voice(2.5), quiet(0.7), voice(4), quiet(0.6));
  const p = pieces(pcm);
  assert.equal(p.length, 3);
  assert.ok(p.every((s) => s.byPause));
  // each piece starts a little before its voice and ends a little after
  assert.ok(Math.abs(p[0].startSample / SR - 0.25) < 0.05);
  assert.ok(Math.abs(p[1].startSample / SR - (0.5 + 3 + 0.7 - 0.25)) < 0.05);
});

test("a short gap between words does not cut a piece", () => {
  const pcm = concat(quiet(0.4), voice(1), quiet(0.15), voice(1), quiet(0.6));
  assert.equal(pieces(pcm).length, 1);
});

test("a click shorter than a syllable opens no piece", () => {
  assert.equal(pieces(concat(quiet(0.5), voice(0.08), quiet(1))).length, 0);
});

test("speech without a pause is split before it gets long, at its quietest moment", () => {
  // 20 s of voice with a soft dip every 2.3 s
  const parts: Float32Array[] = [quiet(0.4)];
  for (let i = 0; i < 9; i++) parts.push(voice(2.2), voice(0.1, 0.03));
  const p = pieces(concat(...parts, quiet(0.6)));
  assert.ok(p.length >= 2);
  for (const s of p) assert.ok((s.endSample - s.startSample) / SR <= 15.05);
  const cut = p.find((s) => !s.byPause)!;
  const cutSec = cut.endSample / SR - 0.4;
  const intoCycle = cutSec % 2.3;
  assert.ok(intoCycle > 2.15 || intoCycle < 0.05, `cut at ${cutSec.toFixed(2)} s is not in a dip`);
});

test("voiced ranges say where the voice was inside a piece", () => {
  const pcm = concat(quiet(0.5), voice(2), quiet(0.2), voice(2), quiet(0.8));
  const [p] = pieces(pcm);
  const v = p.voiced.map(([a, b]) => [a / SR, b / SR]);
  assert.ok(v.length >= 2);
  assert.ok(Math.abs(v[0][0] - 0.5) < 0.2);
  assert.ok(Math.abs(v.at(-1)![1] - 4.7) < 0.2);
});

test("a long silence after speech is reported once per mark", () => {
  const ev = segmentAll(concat(quiet(0.4), voice(2), quiet(4)), { silenceMarks: [2500] });
  const marks = ev.filter((e) => e.type === "silence");
  assert.equal(marks.length, 1);
});

test("the same samples in different chunk sizes give the same pieces", () => {
  const pcm = concat(quiet(0.5), voice(3), quiet(0.7), voice(2.5), quiet(0.7));
  const a = segmentAll(pcm, {}, 128).flatMap((e) => (e.type === "segment" ? [[e.segment.startSample, e.segment.endSample]] : []));
  const b = segmentAll(pcm, {}, 4096).flatMap((e) => (e.type === "segment" ? [[e.segment.startSample, e.segment.endSample]] : []));
  assert.deepEqual(a, b);
});

test("the open piece can be read while it is still being spoken", () => {
  const s = new Segmenter();
  s.push(concat(quiet(0.4), voice(2)));
  const open = s.openAudio();
  assert.ok(open && open.audio.length > SR * 1.5);
  assert.ok(s.openMs() > 1500);
});

test("a reciter already speaking when the microphone opens keeps the first phrase", () => {
  const p = pieces(concat(voice(3.8), quiet(0.5), voice(3), quiet(0.5), voice(3), quiet(0.6)));
  assert.equal(p.length, 3);
  assert.ok(p[0].startSample === 0);
});

test("digital zeros before a room at -50 dBFS still find the pauses (and the hesitation)", () => {
  const zeros = new Float32Array(Math.round(0.3 * SR));
  const room = (sec: number) => quiet(sec, 0.004);
  const parts: Float32Array[] = [zeros, room(0.5)];
  for (let i = 0; i < 5; i++) parts.push(voice(3.5), room(0.45));
  parts.push(voice(3.5), room(3.2));
  const ev = segmentAll(concat(...parts), { silenceMarks: [2500] });
  assert.equal(ev.filter((e) => e.type === "segment").length, 6);
  assert.equal(ev.filter((e) => e.type === "silence").length, 1);
});
