/**
 * Small original doodles (stars, clouds, hearts, spirals, scribbles) drawn as pencil line art.
 * Purely decorative: every export is aria-hidden. Fills come from the pastel tokens; inside `.world-mono`
 * those tokens turn white, so the same doodles become empty line drawings.
 */
export type DoodleKind = "star" | "cloud" | "heart" | "spiral" | "scribble" | "sparkle" | "moon";

const PATHS: Record<DoodleKind, string> = {
  star: "M24 5 L28.6 17.5 L42 18.6 L31.6 27.4 L35.2 41 L24 33.4 L12.6 41.2 L16.2 27.6 L5.8 18.8 L19.4 17.6 Z",
  cloud: "M11 36 C3 36.5 2.5 26 10 25.5 C9 16 21 13 25 20.5 C31 15.5 41 21.5 37.5 29 C45.5 30 43.5 37 36 36.4 Z",
  heart: "M24 40.5 C9.5 30.5 5.5 20.5 11.5 13 C17 7.5 22.5 11 24 16.5 C26 11 32 7.5 37.5 13 C43.5 20.5 38.5 30.5 24 40.5 Z",
  spiral: "M24 24 C26 23.5 27.6 25.5 26.4 28 C24.2 31.4 18.6 30.2 17.8 25.6 C16.6 19.2 22.4 14.4 28.6 16.6 C36.2 19.6 36.6 30.6 29.8 36 C21 42 9.8 34.6 11 23.8",
  scribble: "M4 29 C9 17 13 40 18 27 C23 14 27 40 32 27 C37 15 41 35 45 24",
  sparkle: "M24 6 C25 17 28 21 40 24 C28 27 25 31 24 42 C23 31 20 27 8 24 C20 21 23 17 24 6 Z",
  moon: "M32 8 C20 8 10 17 10 28 C10 38 19 44 29 42 C21 38 19 27 24 19 C26 15 29 11 32 8 Z",
};

export function Doodle({ kind, fill = "pink", size = 40, className = "" }: { kind: DoodleKind; fill?: "pink" | "lavender" | "sky" | "mint" | "butter" | "none"; size?: number; className?: string }) {
  const filled = kind !== "scribble" && fill !== "none";
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 48 48" width={size} height={size} className={className}
      fill={filled ? `var(--color-${fill})` : "none"} stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[kind]} />
    </svg>
  );
}

export type DoodleSpot = { kind: DoodleKind; fill?: "pink" | "lavender" | "sky" | "mint" | "butter" | "none"; x: string; y: string; size?: number; rot?: number; float?: boolean; delay?: number; hideOnPhone?: boolean };

/** Absolutely positioned layer of doodles; put it inside a `relative` box. */
export function DoodleField({ spots, className = "" }: { spots: DoodleSpot[]; className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {spots.map((d, i) => (
        <span key={i} style={{ left: d.x, top: d.y, ["--r" as string]: `${d.rot ?? 0}deg`, rotate: `${d.rot ?? 0}deg`, animationDelay: `${d.delay ?? 0}s` }}
          className={`absolute ${d.float ? "doodle-float" : "doodle-blink"} ${d.hideOnPhone ? "hidden sm:block" : ""}`}>
          <Doodle kind={d.kind} fill={d.fill} size={d.size ?? 40} />
        </span>
      ))}
    </div>
  );
}
