import ListenView from "@/components/ListenView";

export const metadata = {
  title: "Lyssna på Koranen — Dugsi",
  description: "Lyssna på hela Koranen, vers för vers, i din valda Sheikhs röst.",
};

export default function ListenPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-6">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-ink">Lyssna på Koranen</h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink/60">
          Välj en surah och en Sheikh, tryck play — och lyssna hela vägen igenom, vers för vers.
        </p>
      </header>
      <ListenView />
    </main>
  );
}
