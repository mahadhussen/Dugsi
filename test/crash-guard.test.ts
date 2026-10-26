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
// The guard protects phones (a tab killed for memory): test as an iPhone,
// and as a computer where it must never switch the model off.
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const asDevice = (userAgent: string, maxTouchPoints = 0) =>
  Object.defineProperty(globalThis, "navigator", { value: { userAgent, maxTouchPoints }, configurable: true });
asDevice(IPHONE, 5);

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

test("on a computer a leftover breadcrumb never switches the model off", () => {
  mem.clear();
  asDevice(MAC);
  try {
    for (let i = 0; i < 4; i++) {
      markWhisperRunning();
      checkForPriorCrash(T + i * 1000);
    }
    assert.equal(whisperDisabledByCrashes(), false);
    // An old "disabled" left from before is not honoured on a computer either.
    mem.setItem("dugsi:asr2:disabled", "1");
    assert.equal(whisperDisabledByCrashes(), false);
  } finally {
    asDevice(IPHONE, 5);
  }
});
