import PrayerView from "@/components/PrayerView";

export const metadata = {
  title: "Bönetider Göteborg & Adhan — Dugsi",
  description:
    "Bönetider för Göteborg (Fajr, Dhuhr, Asr, Maghrib, Isha) med nedräkning till nästa bön och en adhan-spelare.",
};

export default function PrayerPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-6">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-ink">Bönetider</h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink/60">
          Göteborg · nästa bön med nedräkning, och adhan att lyssna på.
        </p>
      </header>
      <PrayerView />
    </main>
  );
}
