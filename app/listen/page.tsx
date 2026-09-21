import ListenView from "@/components/ListenView";

export const metadata = {
  title: "Lyssna på Koranen — Dugsi",
  description: "Lyssna på hela Koranen, vers för vers, i din valda Sheikhs röst.",
};

export default function ListenPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-3">
      <ListenView />
    </main>
  );
}
