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
      <section className="relative overflow-hidden rounded-2xl bg-emerald-dark px-6 py-6 text-center text-white shadow-soft">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.10]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 20%, #e3c987 0 2px, transparent 3px), radial-gradient(circle at 85% 70%, #e3c987 0 2px, transparent 3px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="relative">
          <p className="text-xs uppercase tracking-wide text-gold-soft/80">
            {GOTHENBURG.name} · {formatDate(now)}
          </p>
          <p className="mt-3 text-sm text-white/70">
            Nästa bön{np.tomorrow ? " (imorgon)" : ""}
          </p>
          <p className="ayah mt-1 text-3xl text-gold-soft" dir="rtl">
            {np.slot.arabic}
          </p>
          <p className="text-xl font-semibold">
            {np.slot.label} · {formatTime(np.slot.time)}
          </p>
          <p className="mt-2 inline-block rounded-full bg-white/10 px-4 py-1.5 text-sm text-gold-soft ring-1 ring-white/15">
            om {formatCountdown(np.msUntil)}
          </p>
        </div>
      </section>

      {/* Today's times */}
      <section className="overflow-hidden rounded-2xl border border-gold/25 bg-white/80 shadow-soft">
        <ul className="divide-y divide-gold/15">
          {slots.map((s) => (
            <TimeRow key={s.key} slot={s} isNext={!np.tomorrow && s.key === np.slot.key} />
          ))}
        </ul>
      </section>

      <AdhanPlayer />

      <p className="text-center text-xs text-ink/50">
        Tiderna beräknas på din enhet med Muslim World League-metoden och korrigeringen “en sjundedel
        av natten” — samma metod som{" "}
        <a
          href="https://salatgbg.se"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-ink"
        >
          salatgbg.se
        </a>
        . Små avvikelser på någon minut kan förekomma.
      </p>
    </div>
  );
}

function TimeRow({ slot, isNext }: { slot: PrayerSlot; isNext: boolean }) {
  return (
    <li
      className={`flex items-center justify-between px-5 py-3.5 ${
        isNext ? "bg-emerald/10" : ""
      } ${!slot.isPrayer ? "text-ink/55" : "text-ink"}`}
    >
      <span className="flex items-center gap-3">
        <span
          className={`grid h-8 w-8 place-items-center rounded-full text-sm ${
            isNext ? "bg-emerald text-white" : slot.isPrayer ? "bg-gold/15 text-gold-deep" : "bg-ink/5 text-ink/40"
          }`}
        >
          {slot.isPrayer ? "🕌" : "☀︎"}
        </span>
        <span>
          <span className="block text-sm font-semibold">{slot.label}</span>
          {isNext && <span className="text-[11px] font-medium text-emerald-deep">nästa bön</span>}
        </span>
      </span>
      <span className="flex items-center gap-3">
        <span className="ayah text-lg text-emerald" dir="rtl">
          {slot.arabic}
        </span>
        <span className="tabular-nums text-base font-semibold">{formatTime(slot.time)}</span>
      </span>
    </li>
  );
}
