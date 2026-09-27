// Study reminders.
//
// A static site has no push server, so reminders work two honest ways:
//   1. While Dugsi is open (a tab, or installed to the home screen and running),
//      a timer fires a system notification at the chosen time.
//   2. A calendar file (.ics) with a daily repeating event, which every phone
//      and desktop calendar can import — that one rings even when Dugsi is closed.

import type { Settings } from "./settings";

/** Milliseconds until the next occurrence of HH:MM on an allowed weekday. */
export function msUntilNext(time: string, days: number[], now: Date): number {
  const [hh, mm] = time.split(":").map(Number);
  const allowed = days.length ? new Set(days) : null;
  for (let d = 0; d < 8; d++) {
    const t = new Date(now);
    t.setDate(now.getDate() + d);
    t.setHours(hh, mm, 0, 0);
    if (t.getTime() <= now.getTime()) continue;
    if (allowed && !allowed.has(t.getDay())) continue;
    return t.getTime() - now.getTime();
  }
  return 7 * 86_400_000;
}

const ICS_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** An iCalendar file with a daily (or chosen-days) repeating reminder. */
export function reminderIcs(settings: Pick<Settings, "reminderTime" | "reminderDays">, now: Date, url: string): string {
  const [hh, mm] = settings.reminderTime.split(":").map(Number);
  const start = new Date(now);
  start.setHours(hh, mm, 0, 0);
  if (start.getTime() <= now.getTime()) start.setDate(start.getDate() + 1);
  const stamp = `${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}T${pad(hh)}${pad(mm)}00`;
  const rule = settings.reminderDays.length
    ? `RRULE:FREQ=WEEKLY;BYDAY=${settings.reminderDays.map((d) => ICS_DAYS[d]).join(",")}`
    : "RRULE:FREQ=DAILY";
  const uidStr = `dugsi-reminder-${hh}${mm}@dugsi`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dugsi//Study reminder//EN",
    "BEGIN:VEVENT",
    `UID:${uidStr}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${stamp}`,
    "DURATION:PT15M",
    rule,
    "SUMMARY:Dugsi — time to recite",
    `DESCRIPTION:Keep your streak going: ${url}`,
    `URL:${url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Time to recite",
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export type NotifyPermission = "granted" | "denied" | "default" | "unsupported";

export function notificationPermission(): NotifyPermission {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotifyPermission> {
  if (typeof Notification === "undefined") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Register the tiny service worker (needed to show notifications on Android). */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(`${BASE}/sw.js`, { scope: `${BASE}/` });
  } catch {
    return null;
  }
}

/** Show a notification now (via the service worker when available). */
export async function showReminderNotification(body: string): Promise<boolean> {
  if (notificationPermission() !== "granted") return false;
  const opts: NotificationOptions = { body, icon: `${BASE}/icons/icon-192.png`, tag: "dugsi-reminder" };
  try {
    const reg = await ensureServiceWorker();
    if (reg) {
      await reg.showNotification("Dugsi — time to recite", opts);
      return true;
    }
    new Notification("Dugsi — time to recite", opts);
    return true;
  } catch {
    return false;
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** (Re)arm the in-app reminder timer from the current settings. */
export function armReminder(settings: Settings, onFire?: () => void): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!settings.reminderEnabled || typeof window === "undefined") return;
  const ms = msUntilNext(settings.reminderTime, settings.reminderDays, new Date());
  // setTimeout overflows past ~24.8 days; re-check daily instead.
  const wait = Math.min(ms, 86_400_000);
  timer = setTimeout(() => {
    if (ms <= 86_400_000) {
      void showReminderNotification("A few verses keep the streak alive. Open Dugsi and recite.");
      onFire?.();
    }
    armReminder(settings, onFire);
  }, wait);
}
