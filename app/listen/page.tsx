import ListenView from "@/components/ListenView";

export const metadata = {
  title: "Listen to the Quran — Dugsi",
  description: "Listen to the whole Quran, verse by verse, in the voice of the Sheikh you choose.",
};

export default function ListenPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-3">
      <ListenView />
    </main>
  );
}
