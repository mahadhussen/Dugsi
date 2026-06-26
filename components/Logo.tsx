// Dugsi mark: a mihrab (prayer-niche arch) holding three recitation sound-waves,
// in gold on deep emerald — recitation within the niche.

export function LogoMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="dugsi-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0f766e" />
          <stop offset="100%" stopColor="#08332f" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="46" height="46" rx="13" fill="url(#dugsi-tile)" />
      <rect x="1" y="1" width="46" height="46" rx="13" stroke="#c9a24b" strokeOpacity="0.45" />
      {/* mihrab arch */}
      <path
        d="M15 37V23c0-6 4-10 9-10s9 4 9 10v14"
        stroke="#e3c987"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* recitation waves inside the niche */}
      <g stroke="#e3c987" strokeWidth="2.4" strokeLinecap="round">
        <path d="M20 28v6" opacity="0.7" />
        <path d="M24 24v14" />
        <path d="M28 28v6" opacity="0.7" />
      </g>
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <LogoMark size={44} />
      <div className="leading-none">
        <div className="text-2xl font-bold tracking-tight text-white">Dugsi</div>
        <div className="text-[11px] uppercase tracking-[0.28em] text-gold-soft/90">
          Recite &amp; learn
        </div>
      </div>
    </div>
  );
}
