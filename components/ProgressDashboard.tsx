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

type Tab = "overview" | "mistakes" | "recordings" | "goals";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "mistakes", label: "Mistakes" },
  { id: "recordings", label: "Recordings" },
  { id: "goals", label: "Goals & reminders" },
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
        <h1 className="text-2xl font-bold text-ink">Your progress</h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink/60">
          {user
            ? "Synced with your account across devices."
            : configured
              ? "Saved on this device. Sign in (top right) to sync across devices."
              : "Saved on this device."}
        </p>
      </header>

      <nav className="flex gap-1 overflow-x-auto rounded-full border border-gold/25 bg-white/70 p-1 text-sm shadow-soft">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => pick(t.id)}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 font-medium transition ${
              tab === t.id ? "bg-emerald text-white shadow" : "text-ink/70 hover:text-ink"
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
          <Card title="Reciting">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                <span className="block font-semibold text-ink">Live mistake marking</span>
                <span className="block text-xs text-ink/55">
                  Flag skipped and substituted words in red as you recite. Off = only correct words light up, and
                  mistakes are shown when you stop.
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.liveMistakes}
                onChange={(e) => updateSettings({ liveMistakes: e.target.checked }, user?.id ?? null)}
                className="h-5 w-5 accent-emerald"
              />
            </label>
          </Card>
        </div>
      )}

      {stats && tab === "overview" && bookmarks.length > 0 && (
        <Card title="Bookmarks" sub="Verses you marked while reading.">
          <ul className="space-y-1.5">
            {bookmarks.map((b) => {
              const meta = surahMeta(b.surah);
              return (
                <li key={`${b.surah}:${b.verse}`} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-ink/5">
                  <Link href={`/?surah=${b.surah}&verse=${b.verse}`} className="min-w-0 truncate text-ink hover:underline">
                    {meta?.transliteration ?? `Surah ${b.surah}`} · verse {b.verse}
                    <span className="ayah ml-2 text-lg text-emerald" dir="rtl">
                      {meta?.nameArabic}
                    </span>
                  </Link>
                  <button
                    onClick={() => toggleBookmark(b.surah, b.verse, user?.id ?? null)}
                    className="shrink-0 text-xs text-ink/40 hover:text-red-600"
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
        <div className="rounded-2xl border border-emerald/25 bg-emerald/5 p-4 text-sm text-ink/70">
          Nothing recorded yet.{" "}
          <Link href="/" className="font-semibold text-emerald-deep underline underline-offset-2">
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

      <Card title="Today's goals" sub="Change them under Goals & reminders.">
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
          <Mini value={stats.totals.correct} label="correct words" tone="#0f766e" />
          <Mini value={stats.totals.wrong} label="wrong" tone="#dc2626" />
          <Mini value={stats.totals.missing} label="skipped" tone="#d97706" />
          <Mini value={stats.totals.extra} label="added" tone="#d97706" />
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
    <div className="rounded-2xl border border-gold/25 bg-white/80 p-3 shadow-soft">
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-emerald-deep">{value}</span>
        <span className="text-xs text-ink/50">{unit}</span>
      </div>
      <div className="text-xs text-ink/60">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-ink/40">{hint}</div>}
    </div>
  );
}

function Mini({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="rounded-xl border border-ink/10 bg-white p-2">
      <div className="text-lg font-bold" style={{ color: tone }}>
        {value}
      </div>
      <div className="text-xs text-ink/55">{label}</div>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gold/25 bg-white/70 p-4 shadow-soft backdrop-blur-sm sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-5 w-1.5 rounded-full bg-gold" />
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/70">{title}</h2>
          {sub && <p className="text-xs text-ink/50">{sub}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
