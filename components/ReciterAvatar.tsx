"use client";

import { useEffect, useState } from "react";
import type { Reciter } from "@/lib/audio-quran";
import { cachedPhoto, fetchPhoto } from "@/lib/reciter-photo";

// A calm palette for monograms, picked by name so each reciter keeps his colour.
const HUES = [160, 190, 210, 35, 15, 275, 120, 240];

function hue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

function initials(r: Reciter): string {
  // First letters of the first two Arabic words, e.g. "مش" — or Latin initials.
  const parts = r.arabicName.replace(/[-–—]/g, " ").split(/\s+/).filter(Boolean);
  if (parts.length >= 1) return parts.slice(0, 2).map((p) => p[0]).join("");
  return r.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
}

/**
 * Portrait when Wikipedia has one (loaded lazily, cached for a month), otherwise
 * a monogram medallion in the reciter's own colour.
 */
export default function ReciterAvatar({ reciter, size = 44, className = "" }: { reciter: Reciter; size?: number; className?: string }) {
  const article = reciter.wikipedia;
  const [photo, setPhoto] = useState<string | null | undefined>(() => (article ? cachedPhoto(article) : null));
  useEffect(() => {
    if (!article) return;
    let cancelled = false;
    const hit = cachedPhoto(article);
    if (hit !== undefined) {
      setPhoto(hit);
      return;
    }
    void fetchPhoto(article).then((u) => !cancelled && setPhoto(u));
    return () => {
      cancelled = true;
    };
  }, [article]);

  const h = hue(reciter.name);
  const style = { width: size, height: size, fontSize: size * 0.4 };
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setPhoto(null)}
        className={`shrink-0 rounded-full object-cover ring-1 ring-ink/10 ${className}`}
        style={style}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`ayah inline-grid shrink-0 place-items-center rounded-full font-bold leading-none ring-1 ring-ink/10 ${className}`}
      style={{
        ...style,
        lineHeight: 1,
        background: `linear-gradient(135deg, hsl(${h} 45% 88%), hsl(${h} 40% 78%))`,
        color: `hsl(${h} 45% 24%)`,
      }}
    >
      {initials(reciter)}
    </span>
  );
}
