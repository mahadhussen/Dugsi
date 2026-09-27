import ProgressDashboard from "@/components/ProgressDashboard";
import PageHeader from "@/components/PageHeader";

export const metadata = {
  title: "Dugsi — Your progress",
  description: "Minutes recited, verses covered, streaks, goals, mistake history and your recordings.",
};

export default function ProgressPage() {
  return (
    <>
      <PageHeader title="Progress" />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-4">
        <ProgressDashboard />
      </main>
    </>
  );
}
