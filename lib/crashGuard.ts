// Adaptive crash protection for the on device Whisper refinement.
//
// If the tab is memory killed while Whisper analyses, no error handler runs — the
// page is simply gone. So we leave a breadcrumb in localStorage when the analysis
// starts and clear it when it ends. If the app boots and finds the breadcrumb
// still set, the previous analysis killed the page. After enough such events,
// Whisper is disabled on this device; everything else keeps working.
//
// Fairness (so we never punish an innocent close):
//   • A deliberate close or backgrounding fires pagehide/visibilitychange, where
//     we clear the breadcrumb — that is not a crash. A real memory kill fires
//     neither, so its breadcrumb survives and is counted.
//   • The crash count DECAYS: after a week with no incident it resets, and a
//     device disabled long ago is re enabled automatically.
//   • The reciter can always re enable manually.

const STAGE_KEY = "dugsi:whisperStage";
const COUNT_KEY = "dugsi:whisperCrashCount";
const DISABLED_KEY = "dugsi:whisperDisabled";
const LAST_KEY = "dugsi:whisperLastIncident";
const DISABLE_AFTER = 2;
const DECAY_MS = 7 * 24 * 60 * 60 * 1000; // a week without incident forgives

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** Call once at app start. Turns a leftover breadcrumb into a counted incident,
 *  and forgives old incidents so a device is never disabled forever. */
export function checkForPriorCrash(now: number = Date.now()): void {
  const ls = storage();
  if (!ls) return;
  try {
    const last = Number(ls.getItem(LAST_KEY)) || 0;
    const stale = last > 0 && now - last > DECAY_MS;

    if (ls.getItem(STAGE_KEY)) {
      // The previous analysis never signalled completion → it killed the page.
      ls.removeItem(STAGE_KEY);
      const base = stale ? 0 : Number(ls.getItem(COUNT_KEY)) || 0;
      const count = base + 1;
      ls.setItem(COUNT_KEY, String(count));
      ls.setItem(LAST_KEY, String(now));
      if (count >= DISABLE_AFTER) ls.setItem(DISABLED_KEY, "1");
      return;
    }

    // No incident this boot. If the last one was long ago, forgive everything.
    if (stale) reEnableWhisper();
  } catch {
    /* ignore */
  }
}

export function whisperDisabledByCrashes(): boolean {
  try {
    return storage()?.getItem(DISABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markWhisperRunning(): void {
  try {
    storage()?.setItem(STAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function markWhisperFinished(): void {
  try {
    storage()?.removeItem(STAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** A deliberate leave (pagehide/tab hidden) is not a crash — drop the breadcrumb
 *  so it cannot be counted on the next boot. Safe to call any time. */
export function clearCrashBreadcrumb(): void {
  markWhisperFinished();
}

/** Manual reset: re enable the on device check and forget past incidents. */
export function reEnableWhisper(): void {
  const ls = storage();
  if (!ls) return;
  try {
    ls.removeItem(DISABLED_KEY);
    ls.removeItem(COUNT_KEY);
    ls.removeItem(STAGE_KEY);
    ls.removeItem(LAST_KEY);
  } catch {
    /* ignore */
  }
}
