"use client";

import { useEffect, useState } from "react";
import { useSettings, updateSettings } from "@/lib/settings";
import { useAuth } from "@/lib/supabase/AuthProvider";
import {
  notificationPermission,
  requestNotificationPermission,
  reminderIcs,
  showReminderNotification,
  type NotifyPermission,
} from "@/lib/reminders";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_INDEX = [1, 2, 3, 4, 5, 6, 0]; // JS getDay() values, Monday first

/** Daily study reminder: a notification while Dugsi is open, and a calendar
 *  file for when it is not. Honest about what a web app can and cannot do. */
export default function ReminderSettings() {
  const settings = useSettings();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [perm, setPerm] = useState<NotifyPermission>("default");
  const [tested, setTested] = useState<string | null>(null);
  useEffect(() => setPerm(notificationPermission()), []);

  const toggleEnabled = async () => {
    if (!settings.reminderEnabled) {
      const p = await requestNotificationPermission();
      setPerm(p);
    }
    updateSettings({ reminderEnabled: !settings.reminderEnabled }, userId);
  };
  const toggleDay = (d: number) => {
    const cur = new Set(settings.reminderDays);
    if (cur.has(d)) cur.delete(d);
    else cur.add(d);
    updateSettings({ reminderDays: Array.from(cur) }, userId);
  };
  const test = async () => {
    const p = await requestNotificationPermission();
    setPerm(p);
    const ok = p === "granted" && (await showReminderNotification("This is what your reminder looks like."));
    setTested(ok ? "Sent — check your notifications." : "Notifications are blocked for this site in your browser settings.");
  };
  const downloadIcs = () => {
    const url = typeof window !== "undefined" ? window.location.origin + (process.env.NEXT_PUBLIC_BASE_PATH ?? "") + "/" : "";
    const blob = new Blob([reminderIcs(settings, new Date(), url)], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dugsi-reminder.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center justify-between gap-3 rounded-xl border border-ink/10 bg-surface-2 p-3 text-sm">
        <span>
          <span className="block font-semibold text-ink">Daily reminder</span>
          <span className="block text-xs text-ink/55">A nudge at your chosen time to keep the streak alive.</span>
        </span>
        <input type="checkbox" checked={settings.reminderEnabled} onChange={() => void toggleEnabled()} className="h-5 w-5 accent-emerald" />
      </label>

      <div className={`space-y-3 rounded-xl border border-ink/10 bg-surface-2 p-3 text-sm ${settings.reminderEnabled ? "" : "opacity-60"}`}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-ink/80">Time</span>
          <input
            type="time"
            value={settings.reminderTime}
            onChange={(e) => updateSettings({ reminderTime: e.target.value }, userId)}
            className="rounded-lg border border-ink/15 bg-surface-2 px-2 py-1 text-sm outline-none focus:border-emerald"
          />
        </div>
        <div>
          <span className="mb-1.5 block text-ink/80">Days <span className="text-xs text-ink/45">(none selected = every day)</span></span>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((label, i) => {
              const d = DAY_INDEX[i];
              const on = settings.reminderDays.includes(d);
              return (
                <button
                  key={d}
                  onClick={() => toggleDay(d)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition ${
                    on ? "bg-emerald text-white ring-emerald" : "bg-surface-2 text-ink/70 ring-ink/15 hover:bg-ink/5"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => void test()} className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-medium text-ink/80 hover:bg-ink/5">
            Send a test notification
          </button>
          <button onClick={downloadIcs} className="rounded-lg bg-emerald px-3 py-1.5 text-xs font-semibold text-white shadow-soft">
            Add to my calendar (.ics)
          </button>
        </div>
        {tested && <p className="text-xs text-ink/60">{tested}</p>}
        <p className="text-xs text-ink/50">
          {perm === "denied"
            ? "Notifications are blocked for Dugsi in this browser. Allow them in the site settings, or use the calendar file."
            : perm === "unsupported"
              ? "This browser cannot show notifications. Use the calendar file instead — it rings on any phone."
              : "Notifications fire while Dugsi is open or installed to your home screen. For a reminder that works even when the app is closed, add the calendar event — it repeats automatically."}
        </p>
      </div>
    </div>
  );
}
