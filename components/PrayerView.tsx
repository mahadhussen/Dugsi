"use client";

import { useEffect, useState } from "react";
import {
  prayerSlots,
  nextPrayer,
  formatTime,
  formatCountdown,
  formatDate,
  GOTHENBURG,
  type PrayerSlot,
} from "@/lib/prayer-times";
import AdhanPlayer from "./AdhanPlayer";

export default function PrayerView() {
  // Time-dependent, so render only after mount to avoid an SSR/CSR mismatch.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!now) {
    return (
      <div className="flex justify-center py-16 text-ink/50">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-gold border-t-transparent" />
      </div>
    );
  }

  const slots = prayerSlots(now);
  const np = nextPrayer(now);

  return (
    <div className="space-y-6">
      {/* Next prayer + countdown */}
      <section className="relative overflow-hidden rounded-3xl bg-emerald-dark px-6 py-7 text-center text-white shadow-soft">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.10]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 20%, #e3c987 0 2px, transparent 3px), radial-gradient(circle at 85% 70%, #e3c987 0 2px, transparent 3px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="relative">
          <p className="text-sm font-bold uppercase tracking-wide text-gold/90">
            {GOTHENBURG.name} · {formatDate(now)}
          </p>
          <p className="mt-3 text-base font-semibold text-white/70">
            Next prayer{np.tomorrow ? " (tomorrow)" : ""}
          </p>
          <p className="ayah mt-1 text-4xl text-gold" dir="rtl">
            {np.slot.arabic}
          </p>
          <p className="text-3xl font-extrabold">
            {np.slot.label} · {formatTime(np.slot.time)}
          </p>
          <p className="mt-3 inline-block rounded-full bg-white/10 px-5 py-2 text-lg font-bold text-gold ring-1 ring-white/15">
            in {formatCountdown(np.msUntil)}
          </p>
        </div>
      </section>

      {/* Today's times */}
      <section className="card overflow-hidden">
        <ul className="divide-y divide-gold/15">
          {slots.map((s) => (
            <TimeRow key={s.key} slot={s} isNext={!np.tomorrow && s.key === np.slot.key} />
          ))}
        </ul>
      </section>

      <AdhanPlayer />

      <p className="text-center text-sm font-semibold text-ink/50">
        Times are computed on your device with the Muslim World League method and the “one-seventh of
        the night” high-latitude rule, the same method as{" "}
        <a
          href="https://salatgbg.se"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-ink"
        >
          salatgbg.se
        </a>
        . Expect a minute or so of difference.
      </p>
    </div>
  );
}

function TimeRow({ slot, isNext }: { slot: PrayerSlot; isNext: boolean }) {
  return (
    <li
      className={`flex items-center justify-between px-5 py-4 ${
        isNext ? "bg-emerald/10" : ""
      } ${!slot.isPrayer ? "text-ink/55" : "text-ink"}`}
    >
      <span className="flex items-center gap-3">
        <span
          className={`grid h-8 w-8 place-items-center rounded-full text-sm ${
            isNext ? "bg-emerald text-white" : slot.isPrayer ? "bg-gold/15 text-gold-soft" : "bg-ink/5 text-ink/40"
          }`}
        >
          {slot.isPrayer ? "🕌" : "☀︎"}
        </span>
        <span>
          <span className="block text-lg font-bold">{slot.label}</span>
          {isNext && <span className="text-xs font-bold text-emerald-bright">next</span>}
        </span>
      </span>
      <span className="flex items-center gap-3">
        <span className="ayah text-xl text-emerald-bright" dir="rtl">
          {slot.arabic}
        </span>
        <span className="tabular-nums text-xl font-extrabold">{formatTime(slot.time)}</span>
      </span>
    </li>
  );
}
