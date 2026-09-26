import { Suspense } from "react";
import { MatrigmaPractice } from "@/components/matrigma-practice";

export default function Page() {
  return (
    <Suspense>
      <MatrigmaPractice />
    </Suspense>
  );
}
