"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RECITERS,
  STYLE_LABEL,
  reciterBitrate,
  reciterCountries,
  reciterQuality,
  reciterWikipediaUrl,
  type Reciter,
  type ReciterStyle,
} from "@/lib/audio-quran";
import { useReciter } from "@/lib/reciter-store";
import { noteRecentReciter, toggleFavouriteReciter, useReciterPrefs } from "@/lib/reciter-prefs";
import { hasWordTimings } from "@/lib/quran/timings";
import ReciterAvatar from "./ReciterAvatar";

type StyleFilter = "all" | ReciterStyle;

/** Choose which Sheikh (qari) to listen to. The choice is shared everywhere
 *  audio plays and remembered across visits. Opens a browsable library with
 *  search, style and country filters, favourites and recently used. */
export default function ReciterPicker({ hideTrigger = false }: { hideTrigger?: boolean }) {
  const { reciter, setReciterId } = useReciter();
  const prefs = useReciterPrefs();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState<StyleFilter>("all");
  const [country, setCountry] = useState<string | "all">("all");
  const [onlyFav, setOnlyFav] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("dugsi:open-reciters", onOpen);
    return () => window.removeEventListener("dugsi:open-reciters", onOpen);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const countries = useMemo(() => reciterCountries(), []);
  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    return RECITERS.filter((r) => {
      if (style !== "all" && r.style !== style) return false;
      if (country !== "all" && r.country !== country) return false;
      if (onlyFav && !prefs.favourites.includes(r.id)) return false;
      if (!t) return true;
      return (
        r.name.toLowerCase().includes(t) ||
        r.country.toLowerCase().includes(t) ||
        (r.note?.toLowerCase().includes(t) ?? false) ||
        r.arabicName.includes(query.trim())
      );
    });
  }, [query, style, country, onlyFav, prefs.favourites]);

  const filtering = query.trim() !== "" || style !== "all" || country !== "all" || onlyFav;
  const recent = prefs.recent.map((id) => RECITERS.find((r) => r.id === id)).filter((r): r is Reciter => !!r);
  const popular = filtered.filter((r) => r.popular);
  const rest = filtered.filter((r) => !r.popular);

  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const pick = (id: string) => {
    setReciterId(id);
    noteRecentReciter(id);
    close();
  };

  return (
    <>
      {!hideTrigger && (
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-surface px-4 py-3 text-left shadow-soft transition hover:border-emerald/40"
        >
          <span className="flex min-w-0 items-center gap-3">
            <ReciterAvatar reciter={reciter} size={44} />
            <span className="min-w-0">
              <span className="text-xs text-ink/50">Reciter · Sheikh</span>
              <span className="block truncate text-lg font-semibold text-ink">{reciter.name}</span>
              <span className="block truncate text-xs text-ink/50">
                {STYLE_LABEL[reciter.style]} · {reciter.country}
                {hasWordTimings(reciter.id) ? " · word highlighting" : ""}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="ayah hidden max-w-[10rem] truncate text-xl text-emerald sm:block" dir="rtl">
              {reciter.arabicName}
            </span>
            <span className="text-ink/40">▾</span>
          </span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={close}>
          <div
            className="flex h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-surface shadow-soft sm:h-[85vh] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Choose a reciter"
          >
            {/* Header: search */}
            <div className="border-b border-ink/10 p-3">
              <div className="flex items-center gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, country or style…"
                  autoFocus
                  className="w-full rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-emerald"
                />
                <button onClick={close} className="px-2 text-sm text-ink/60 hover:text-ink">
                  Close
                </button>
              </div>
              {/* Filters */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip on={onlyFav} onClick={() => setOnlyFav((v) => !v)} label={`★ Favourites${prefs.favourites.length ? ` (${prefs.favourites.length})` : ""}`} />
                {(["all", "murattal", "mujawwad", "teaching"] as const).map((s) => (
                  <Chip key={s} on={style === s} onClick={() => setStyle(s)} label={s === "all" ? "All styles" : STYLE_LABEL[s]} />
                ))}
              </div>
              <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
                <Chip on={country === "all"} onClick={() => setCountry("all")} label="All countries" />
                {countries.map((c) => (
                  <Chip key={c} on={country === c} onClick={() => setCountry(c)} label={c} />
                ))}
              </div>
            </div>

            {/* List */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {!filtering && recent.length > 0 && (
                <Section title="Recently used">
                  {recent.map((r) => (
                    <Row key={r.id} r={r} current={r.id === reciter.id} fav={prefs.favourites.includes(r.id)} onPick={pick} />
                  ))}
                </Section>
              )}
              {popular.length > 0 && (
                <Section title={filtering ? "Matches" : "Popular"}>
                  {popular.map((r) => (
                    <Row key={r.id} r={r} current={r.id === reciter.id} fav={prefs.favourites.includes(r.id)} onPick={pick} />
                  ))}
                </Section>
              )}
              {rest.length > 0 && (
                <Section title={filtering ? (popular.length ? "More matches" : "Matches") : "All reciters"}>
                  {rest.map((r) => (
                    <Row key={r.id} r={r} current={r.id === reciter.id} fav={prefs.favourites.includes(r.id)} onPick={pick} />
                  ))}
                </Section>
              )}
              {filtered.length === 0 && (
                <div className="p-6 text-center text-sm text-ink/50">
                  No reciter matches.
                  {filtering && (
                    <button
                      onClick={() => {
                        setQuery("");
                        setStyle("all");
                        setCountry("all");
                        setOnlyFav(false);
                      }}
                      className="ml-2 font-semibold text-emerald-bright underline underline-offset-2"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}
              <p className="px-4 pb-4 pt-2 text-[11px] text-ink/40">
                {RECITERS.length} reciters, all Hafs ʿan ʿĀṣim, streamed from everyayah.com. Portraits come from Wikipedia where
                available. If a Sheikh will not play, the archive may be down for that recording; pick another.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Chip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition ${
        on ? "bg-emerald text-white ring-emerald" : "bg-surface text-ink/70 ring-ink/15 hover:bg-ink/5"
      }`}
    >
      {label}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="sticky top-0 z-10 bg-surface/95 px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink/45 backdrop-blur">
        {title}
      </p>
      <ul>{children}</ul>
    </div>
  );
}

function Row({ r, current, fav, onPick }: { r: Reciter; current: boolean; fav: boolean; onPick: (id: string) => void }) {
  const q = reciterQuality(r);
  const wiki = reciterWikipediaUrl(r);
  return (
    <li className={`flex items-center gap-3 px-4 py-2.5 transition hover:bg-emerald/10 ${current ? "bg-emerald/10" : ""}`}>
      {wiki ? (
        <a href={wiki} target="_blank" rel="noopener noreferrer" title="About this reciter (Wikipedia)" className="shrink-0">
          <ReciterAvatar reciter={r} size={48} />
        </a>
      ) : (
        <ReciterAvatar reciter={r} size={48} />
      )}
      <button onClick={() => onPick(r.id)} className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-ink">{r.name}</span>
          {current && <span className="shrink-0 rounded-full bg-emerald px-1.5 py-0.5 text-[10px] font-semibold text-white">Chosen</span>}
        </span>
        {r.note && <span className="block truncate text-xs text-ink/55">{r.note}</span>}
        <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-ink/50">
          <Badge>{STYLE_LABEL[r.style]}</Badge>
          <Badge>{r.country}</Badge>
          <Badge tone={q === "high" ? "good" : q === "standard" ? "neutral" : "muted"}>
            {q === "high" ? `High quality · ${reciterBitrate(r)}k` : q === "standard" ? `${reciterBitrate(r)}k` : `Archive · ${reciterBitrate(r)}k`}
          </Badge>
          {hasWordTimings(r.id) && <Badge tone="good">Word highlighting</Badge>}
        </span>
      </button>
      <span className="ayah hidden shrink-0 text-lg text-emerald sm:block" dir="rtl">
        {r.arabicName}
      </span>
      <button
        onClick={() => toggleFavouriteReciter(r.id)}
        aria-pressed={fav}
        aria-label={fav ? "Remove from favourites" : "Add to favourites"}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg transition ${fav ? "text-gold-deep" : "text-ink/25 hover:text-gold-deep"}`}
      >
        {fav ? "★" : "☆"}
      </button>
    </li>
  );
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "good" | "neutral" | "muted" }) {
  const cls =
    tone === "good" ? "bg-emerald/10 text-emerald-bright" : tone === "muted" ? "bg-ink/5 text-ink/45" : "bg-ink/5 text-ink/60";
  return <span className={`rounded-full px-1.5 py-0.5 ${cls}`}>{children}</span>;
}

