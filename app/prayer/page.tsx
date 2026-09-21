import PrayerView from "@/components/PrayerView";

export const metadata = {
  title: "Prayer times Gothenburg & adhan — Dugsi",
  description:
    "Prayer times for Gothenburg (Fajr, Dhuhr, Asr, Maghrib, Isha) with a countdown to the next prayer and an adhan player.",
};

export default function PrayerPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-6">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-ink">Prayer times</h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink/60">Gothenburg · countdown to the next prayer, and the adhan to listen to.</p>
      </header>
      <PrayerView />
    </main>
  );
}
