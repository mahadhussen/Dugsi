import { test } from "node:test";
import assert from "node:assert/strict";

// Minimal localStorage so the guard's storage logic can be tested in node.
class Mem {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}
const mem = new Mem();
(globalThis as unknown as { localStorage: Mem }).localStorage = mem;

import {
  checkForPriorCrash,
  whisperDisabledByCrashes,
  markWhisperRunning,
  clearCrashBreadcrumb,
  reEnableWhisper,
} from "../lib/crashGuard";

const T = 1_000_000_000_000; // fixed "now"
const DAY = 24 * 60 * 60 * 1000;

test("two suspected crashes disable the on device check", () => {
  mem.clear();
  markWhisperRunning();
  checkForPriorCrash(T);
  assert.equal(whisperDisabledByCrashes(), false, "one crash should not disable");
  markWhisperRunning();
  checkForPriorCrash(T + 1000);
  assert.equal(whisperDisabledByCrashes(), true, "two crashes should disable");
});

test("a deliberate close (breadcrumb cleared) is never counted", () => {
  mem.clear();
  markWhisperRunning();
  clearCrashBreadcrumb(); // pagehide / tab hidden
  checkForPriorCrash(T);
  markWhisperRunning();
  clearCrashBreadcrumb();
  checkForPriorCrash(T + 1000);
  assert.equal(whisperDisabledByCrashes(), false, "clean closes must not disable");
});

test("the crash count decays and re enables after a week", () => {
  mem.clear();
  markWhisperRunning();
  checkForPriorCrash(T);
  markWhisperRunning();
  checkForPriorCrash(T + 1000);
  assert.equal(whisperDisabledByCrashes(), true);
  // A boot 8 days later with no incident forgives everything.
  checkForPriorCrash(T + 8 * DAY);
  assert.equal(whisperDisabledByCrashes(), false, "should re enable after a quiet week");
});

test("an old incident does not stack onto a fresh one", () => {
  mem.clear();
  markWhisperRunning();
  checkForPriorCrash(T); // count = 1
  // A crash 8 days later should reset the decayed count, not reach 2.
  markWhisperRunning();
  checkForPriorCrash(T + 8 * DAY);
  assert.equal(whisperDisabledByCrashes(), false, "a lone recent crash must not disable");
});

test("manual re enable clears everything", () => {
  mem.clear();
  markWhisperRunning();
  checkForPriorCrash(T);
  markWhisperRunning();
  checkForPriorCrash(T + 1000);
  assert.equal(whisperDisabledByCrashes(), true);
  reEnableWhisper();
  assert.equal(whisperDisabledByCrashes(), false);
});
