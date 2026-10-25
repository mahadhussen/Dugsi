// Plays a recorded transcription fixture (real model output, see
// scripts/eval/transcribe.ts) through the follower exactly as the live
// pipeline does: pieces in order, and a joined re-decode taken only when it
// fits better. Used by the tests and the eval script.

import type { Ayah } from "@/lib/quran/types";
import { flattenAyat } from "@/lib/quran/types";
import { preferJoined } from "@/lib/listen/policy";
import { applyPiece, createFollower, fitScore, type FollowState, type PieceInput } from "./follower";
import { buildRef } from "./text";
import { verdictOf, type Verdict } from "./verdict";

export interface FixtureWord {
  text: string;
  start: number;
  end: number;
}
export interface Fixture {
  name: string;
  surah: number;
  note: string;
  segments: { t0: number; t1: number; byPause: boolean; text: string; words: FixtureWord[]; voiced: [number, number][] }[];
  joins: { of: [number, number]; text: string; words: FixtureWord[] }[];
}

/** Fixture word times are relative to the decoded audio; the follower wants the recording clock. */
const abs = (words: FixtureWord[], t0: number) => words.map((w) => ({ text: w.text, start: +(t0 + w.start).toFixed(3), end: +(t0 + w.end).toFixed(3) }));

export function runFixture(fx: Fixture, ayat: Ayah[], range?: { start: number; end: number }): { state: FollowState; verdict: Verdict } {
  const ref = buildRef(ayat);
  let state = createFollower(ref, range);
  const before: FollowState[] = [];
  const inputs: PieceInput[] = fx.segments.map((s, i) => ({
    id: i,
    t0: s.t0,
    t1: s.t1,
    text: s.text,
    words: abs(s.words, s.t0),
    voiced: s.voiced,
    cutStart: i > 0 && !fx.segments[i - 1].byPause,
    cutEnd: !s.byPause,
    source: "model",
  }));
  inputs.forEach((inp, i) => {
    before.push(state);
    state = applyPiece(state, inp);
    const j = fx.joins.find((x) => x.of[1] === i);
    if (!j) return;
    const [a, b] = j.of;
    const joined: PieceInput = {
      id: 1000 + i,
      t0: fx.segments[a].t0,
      t1: fx.segments[b].t1,
      text: j.text,
      words: abs(j.words, fx.segments[a].t0),
      voiced: [...fx.segments[a].voiced, ...fx.segments[b].voiced],
      replaces: [a, b],
      cutStart: inputs[a].cutStart,
      cutEnd: inputs[b].cutEnd,
      source: "model",
    };
    const start = before[a];
    if (preferJoined(fitScore(start, [inputs[a], inputs[b]]), fitScore(start, [joined]))) state = applyPiece(state, joined);
  });
  const words = flattenAyat(ayat).map((f) => f.word);
  return { state, verdict: verdictOf(state, { words, engine: "fixture" }) };
}
