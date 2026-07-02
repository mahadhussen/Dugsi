// Adaptive crash protection for the on-device Whisper refinement.
//
// If the tab dies (iOS Safari memory kill) while Whisper is analysing, no error
// handler ever runs — the page is just gone. So we leave a breadcrumb in
// localStorage when the analysis starts and clear it when it ends. If the app
// boots and finds the breadcrumb still set, the previous analysis killed the
// page. After two such events, Whisper is disabled on this device for good:
// live marking, recording and playback all keep working, minus the refinement.

const STAGE_KEY = "dugsi:whisperStage";
const COUNT_KEY = "dugsi:whisperCrashCount";
const DISABLED_KEY = "dugsi:whisperDisabled";
const DISABLE_AFTER = 2;

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** Call once at app start: turns a leftover breadcrumb into a crash count. */
export function checkForPriorCrash(): void {
  const ls = storage();
  if (!ls) return;
  try {
    if (ls.getItem(STAGE_KEY)) {
      ls.removeItem(STAGE_KEY);
      const count = (Number(ls.getItem(COUNT_KEY)) || 0) + 1;
      ls.setItem(COUNT_KEY, String(count));
      if (count >= DISABLE_AFTER) ls.setItem(DISABLED_KEY, "1");
    }
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
    storage()?.setItem(STAGE_KEY, String(1));
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
