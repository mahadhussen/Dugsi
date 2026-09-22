"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { loadStats, type Stats } from "@/lib/supabase/progress";
import { useSettings, updateSettings } from "@/lib/settings";
import { useBookmarks, toggleBookmark } from "@/lib/bookmarks";
import { surahMeta } from "@/lib/quran";
import StreakCalendar from "./charts/StreakCalendar";
import ScoreTrend from "./charts/ScoreTrend";
import WeekBars from "./charts/WeekBars";
import GoalsPanel from "./GoalsPanel";
import ReminderSettings from "./ReminderSettings";
import MistakesPanel from "./MistakesPanel";
import RecordingsPanel from "./RecordingsPanel";
import SurahMasteryList from "./SurahMasteryList";
import AccountButton from "./AccountButton";

type Tab = "overview" | "mistakes" | "recordings" | "goals";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "mistakes", label: "Mistakes" },
  { id: "recordings", label: "Recordings" },
  { id: "goals", label: "Settings" },
];

function readTab(): Tab {
  if (typeof window === "undefined") return "overview";
  const t = window.location.hash.replace("#", "");
  return TABS.some((x) => x.id === t) ? (t as Tab) : "overview";
}

/** The full analytics page: activity, goals, mastery, mistakes, recordings. */
export default function ProgressDashboard() {
  const { user, configured } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const settings = useSettings();
  const bookmarks = useBookmarks();

  useEffect(() => {
    setTab(readTab());
    const onHash = () => setTab(readTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const pick = (t: Tab) => {
    setTab(t);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `#${t}`);
  };

  const refresh = useCallback(() => {
    void loadStats(user?.id ?? null).then(setStats);
  }, [user]);
  useEffect(() => {
    refresh();
    window.addEventListener("dugsi:session", refresh);
    return () => window.removeEventListener("dugsi:session", refresh);
  }, [refresh]);

  return (
    <div className="space-y-5">
      <header className="text-center">
        <p className="mx-auto max-w-md text-sm font-semibold text-ink/60">
          {user
            ? "Synced with your account across devices."
            : configured
              ? "Saved on this device. Sign in under Settings to keep it on every device."
              : "Saved on this device."}
        </p>
      </header>

      <nav className="grid grid-cols-2 gap-1 rounded-2xl border-2 border-ink/10 bg-surface p-1 text-base sm:grid-cols-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => pick(t.id)}
            className={`whitespace-nowrap rounded-xl px-3 py-2.5 font-extrabold transition ${
              tab === t.id ? "bg-emerald text-white shadow-soft" : "text-ink/60 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {!stats ? (
        <div className="flex justify-center py-10">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-gold border-t-transparent" />
        </div>
      ) : tab === "overview" ? (
        <Overview stats={stats} />
      ) : tab === "mistakes" ? (
        <Card title="Words you stumble on" sub="Across every surah, most frequent first.">
          <MistakesPanel words={stats.wordMistakes} />
        </Card>
      ) : tab === "recordings" ? (
        <Card title="Your recordings" sub="Kept only in this browser. Listen back and compare with a qari.">
          <RecordingsPanel />
        </Card>
      ) : (
        <div className="space-y-5">
          <Card title="Goals" sub="Set a pace you can keep every day. Goals sync with your account.">
            <GoalsPanel stats={stats} />
          </Card>
          <Card title="Study reminders">
            <ReminderSettings />
          </Card>
          <Card title="Screen">
            <div className="flex items-center justify-between gap-3 text-base">
              <span>
                <span className="block font-bold text-ink">Light or dark</span>
                <span className="block text-sm font-semibold text-ink/55">Light reads like a printed mushaf; dark is easier at night.</span>
              </span>
              <div className="inline-flex rounded-xl border-2 border-ink/15 p-0.5 text-sm">
                {(["light", "dark"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => updateSettings({ theme: t }, user?.id ?? null)}
                    className={`rounded-lg px-4 py-2 font-extrabold capitalize ${settings.theme === t ? "bg-emerald text-white" : "text-ink/60"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </Card>
          <Card title="Reciting">
            <div className="space-y-4">
            <label className="flex items-center justify-between gap-3 text-base">
              <span>
                <span className="block font-bold text-ink">Live mistake marking</span>
                <span className="block text-sm font-semibold text-ink/55">
                  Flag skipped and substituted words in red as you recite. Off = only correct words light up, and
                  mistakes are shown when you stop.
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.liveMistakes}
                onChange={(e) => updateSettings({ liveMistakes: e.target.checked }, user?.id ?? null)}
                className="h-7 w-7 shrink-0 accent-emerald"
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-base">
              <span>
                <span className="block font-bold text-ink">Quran-tuned recognition</span>
                <span className="block text-sm font-semibold text-ink/55">
                  Use Tarteel&apos;s open Quran-trained Whisper model for the precise check (about 80 MB, downloaded once).
                  Falls back to the light general model on phones that can&apos;t run it.
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.quranModel}
                onChange={(e) => updateSettings({ quranModel: e.target.checked }, user?.id ?? null)}
                className="h-7 w-7 shrink-0 accent-emerald"
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-base">
              <span>
                <span className="block font-bold text-ink">Auto-stop after silence</span>
                <span className="block text-sm font-semibold text-ink/55">
                  Stop the recording by itself after 6 seconds of silence at the end (voice activity detection on your device).
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.autoStop}
                onChange={(e) => updateSettings({ autoStop: e.target.checked }, user?.id ?? null)}
                className="h-7 w-7 shrink-0 accent-emerald"
              />
            </label>
            </div>
          </Card>
          <Card title="Account" sub="Sign in to keep your progress on every device. Everything works without one too.">
            <AccountButton inline />
          </Card>
          <Card title="About Dugsi">
            <Link href="/about" className="btn-quiet w-full">
              Sources, licences and honest limits
            </Link>
          </Card>
        </div>
      )}

      {stats && tab === "overview" && bookmarks.length > 0 && (
        <Card title="Bookmarks" sub="Verses you marked while reading.">
          <ul className="space-y-1.5">
            {bookmarks.map((b) => {
              const meta = surahMeta(b.surah);
              return (
                <li key={`${b.surah}:${b.verse}`} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-base font-semibold ring-1 ring-ink/5">
                  <Link href={`/quran?surah=${b.surah}&verse=${b.verse}`} className="min-w-0 truncate text-ink hover:underline">
                    {meta?.transliteration ?? `Surah ${b.surah}`} · verse {b.verse}
                    <span className="ayah ml-2 text-lg text-emerald" dir="rtl">
                      {meta?.nameArabic}
                    </span>
                  </Link>
                  <button
                    onClick={() => toggleBookmark(b.surah, b.verse, user?.id ?? null)}
                    className="shrink-0 text-xs text-ink/40 hover:text-red-500"
                    aria-label="Remove bookmark"
                  >
                    remove
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Overview({ stats }: { stats: Stats }) {
  const settings = useSettings();
  const empty = stats.totalSessions === 0;
  return (
    <div className="space-y-5">
      {empty && (
        <div className="rounded-2xl border-2 border-emerald/25 bg-emerald/10 p-4 text-base font-semibold text-ink/70">
          Nothing recorded yet.{" "}
          <Link href="/quran" className="font-bold text-emerald-bright underline underline-offset-2">
            Recite a surah
          </Link>{" "}
          and your minutes, verses, streak and mistakes start showing up here.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile value={`${stats.streak}`} unit="days" label="current streak" hint={`best ${stats.bestStreak}`} />
        <Tile value={fmtMin(stats.todaySeconds)} unit="min" label="today" hint={`${fmtMin(stats.weekSeconds)} min this week`} />
        <Tile value={`${stats.weekVerses}`} unit="verses" label="this week" hint={`${stats.totalVerses} all time`} />
        <Tile value={`${stats.averageScore}`} unit="avg" label="score" hint={`${stats.memorisedCount} surahs memorised`} />
      </div>

      <Card title="Today's goals" sub="Change them under Settings.">
        <GoalsPanel stats={stats} editable={false} />
      </Card>

      <div className="grid gap-5 sm:grid-cols-2">
        <Card title="Minutes per day" sub="Last 7 days against your daily goal.">
          <WeekBars days={stats.days} goalMinutes={settings.dailyMinutes} />
        </Card>
        <Card title="Score trend">
          <ScoreTrend points={stats.trend} />
        </Card>
      </div>

      <Card title="Activity" sub="Every day you recited, over the last 16 weeks.">
        <StreakCalendar days={stats.days} />
      </Card>

      <Card
        title="All-time totals"
        sub={`${stats.totalSessions} recitations · ${fmtMin(stats.totalSeconds)} minutes · ${stats.totalVerses} verses`}
      >
        <div className="grid grid-cols-2 gap-3 text-center text-sm sm:grid-cols-5">
          <Mini value={stats.totals.correct} label="correct words" tone="var(--good)" />
          <Mini value={stats.totals.wrong} label="wrong" tone="var(--bad)" />
          <Mini value={stats.totals.missing} label="skipped" tone="var(--warn)" />
          <Mini value={stats.totals.extra} label="added" tone="var(--warn)" />
          <Mini value={stats.totals.peeks} label="peeks" tone="#a9842f" />
        </div>
      </Card>

      {stats.bySurah.length > 0 && (
        <Card title="Memorisation" sub={`${stats.bySurah.length} surahs practised · tap one to review its mistakes.`}>
          <SurahMasteryList bySurah={stats.bySurah} />
        </Card>
      )}
    </div>
  );
}

function fmtMin(seconds: number): string {
  return String(Math.round(seconds / 60));
}

function Tile({ value, unit, label, hint }: { value: string; unit: string; label: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-extrabold text-emerald-bright">{value}</span>
        <span className="text-sm font-bold text-ink/50">{unit}</span>
      </div>
      <div className="text-sm font-bold text-ink/60">{label}</div>
      {hint && <div className="mt-0.5 text-xs font-semibold text-ink/40">{hint}</div>}
    </div>
  );
}

function Mini({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="rounded-xl border-2 border-ink/10 bg-surface-2 p-2">
      <div className="text-2xl font-extrabold" style={{ color: tone }}>
        {value}
      </div>
      <div className="text-xs font-bold text-ink/55">{label}</div>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-6 w-1.5 rounded-full bg-gold" />
        <div>
          <h2 className="text-lg font-extrabold text-ink">{title}</h2>
          {sub && <p className="text-sm font-semibold text-ink/50">{sub}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
