"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { setReading } from "@/lib/reading-store";

/** Old link: listening now lives on the Quran page. */
export default function ListenPage() {
  const router = useRouter();
  useEffect(() => {
    setReading({ mode: "listen" });
    router.replace("/quran");
  }, [router]);
  return null;
}
