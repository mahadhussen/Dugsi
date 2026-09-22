import PrayerView from "@/components/PrayerView";
import PageHeader from "@/components/PageHeader";

export const metadata = {
  title: "Prayer times Gothenburg & adhan — Dugsi",
  description:
    "Prayer times for Gothenburg (Fajr, Dhuhr, Asr, Maghrib, Isha) with a countdown to the next prayer and an adhan player.",
};

export default function PrayerPage() {
  return (
    <>
      <PageHeader title="Prayer times" sub="Gothenburg" />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-4">
        <PrayerView />
      </main>
    </>
  );
}
