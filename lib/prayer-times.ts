// Prayer times for Göteborg, computed on-device so the app stays offline and
// server-free. We match SalatGBG's method: Muslim World League angles with the
// "one-seventh of the night" high-latitude rule (Sube Al-Lail), which keeps
// Fajr/Isha sane through Sweden's bright summer nights. Times land within a
// minute of salatgbg.se; the sun position is computed for Göteborg's exact
// coordinates rather than read from a table.

import {
  Coordinates,
  CalculationMethod,
  PrayerTimes,
  HighLatitudeRule,
} from "adhan";

export const GOTHENBURG = {
  name: "Göteborg",
  lat: 57.7089,
  lng: 11.9746,
  tz: "Europe/Stockholm",
} as const;

export type PrayerKey = "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha";

export interface PrayerSlot {
  key: PrayerKey;
  /** Swedish label. */
  label: string;
  /** Arabic label. */
  arabic: string;
  time: Date;
  /** Sunrise is not a prayer — shown for reference, never "next prayer". */
  isPrayer: boolean;
}

const LABELS: Record<PrayerKey, { label: string; arabic: string; isPrayer: boolean }> = {
  fajr: { label: "Fajr", arabic: "الفجر", isPrayer: true },
  sunrise: { label: "Shuruq", arabic: "الشروق", isPrayer: false },
  dhuhr: { label: "Dhuhr", arabic: "الظهر", isPrayer: true },
  asr: { label: "Asr", arabic: "العصر", isPrayer: true },
  maghrib: { label: "Maghrib", arabic: "المغرب", isPrayer: true },
  isha: { label: "Isha", arabic: "العشاء", isPrayer: true },
};

function compute(date: Date): PrayerTimes {
  const coords = new Coordinates(GOTHENBURG.lat, GOTHENBURG.lng);
  const params = CalculationMethod.MuslimWorldLeague();
  params.highLatitudeRule = HighLatitudeRule.SeventhOfTheNight;
  return new PrayerTimes(coords, date, params);
}

/** The six slots for a given day, in order. */
export function prayerSlots(date = new Date()): PrayerSlot[] {
  const pt = compute(date);
  const order: PrayerKey[] = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];
  return order.map((key) => ({
    key,
    ...LABELS[key],
    time: pt[key],
  }));
}

export interface NextPrayer {
  slot: PrayerSlot;
  /** Milliseconds from `now` until this prayer. */
  msUntil: number;
  /** True when the next prayer is tomorrow's Fajr (after today's Isha). */
  tomorrow: boolean;
}

/** The next actual prayer (skips Shuruq), rolling over to tomorrow's Fajr. */
export function nextPrayer(now = new Date()): NextPrayer {
  const today = prayerSlots(now).filter((s) => s.isPrayer);
  const upcoming = today.find((s) => s.time.getTime() > now.getTime());
  if (upcoming) {
    return { slot: upcoming, msUntil: upcoming.time.getTime() - now.getTime(), tomorrow: false };
  }
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const fajr = prayerSlots(tomorrow).find((s) => s.key === "fajr")!;
  return { slot: fajr, msUntil: fajr.time.getTime() - now.getTime(), tomorrow: true };
}

/** hh:mm in Göteborg's timezone, regardless of the device's own timezone. */
export function formatTime(d: Date): string {
  return d.toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: GOTHENBURG.tz,
  });
}

/** "1 tim 23 min" style countdown from a millisecond duration. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} tim ${m} min`;
  if (m > 0) return `${m} min ${s} s`;
  return `${s} s`;
}

/** Today's date written for Göteborg, e.g. "tisdag 28 juli". */
export function formatDate(d = new Date()): string {
  return d.toLocaleDateString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: GOTHENBURG.tz,
  });
}
