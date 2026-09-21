import ProgressDashboard from "@/components/ProgressDashboard";

export const metadata = {
  title: "Dugsi — Your progress",
  description: "Minutes recited, verses covered, streaks, goals, mistake history and your recordings.",
};

export default function ProgressPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
      <ProgressDashboard />
    </main>
  );
}
