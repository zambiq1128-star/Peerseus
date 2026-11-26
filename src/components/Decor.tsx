/*
 * Decoration for the manga look. Everything here is aria-hidden and ignores the pointer,
 * so it never affects reading, focus order or clicks. Motion stops under prefers-reduced-motion (see globals.css).
 */

/** Speed lines radiating from the centre; the whole disc turns very slowly. Put it in a `relative overflow-hidden` parent. */
export function SpeedLines({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div
        className="speed-lines absolute left-1/2 top-1/2 aspect-square w-[220%] -translate-x-1/2 -translate-y-1/2 animate-spin-slow opacity-35 [mask-image:radial-gradient(circle,transparent_8%,#000_55%)]"
        style={{ background: "repeating-conic-gradient(from 0deg, rgb(255 255 255 / 0.9) 0deg 1.2deg, transparent 1.2deg 7deg, rgb(255 212 0 / 0.8) 7deg 7.8deg, transparent 7.8deg 15deg)" }}
      />
    </div>
  );
}

/** Original sound-effect letters (katakana), big, tilted, outlined and see-through. Decoration only. */
export function Sfx({ items }: { items: { text: string; className: string; rotate: number }[] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map((it) => (
        <span key={it.text} className={`sfx ${it.className}`} style={{ "--r": `${it.rotate}deg`, transform: `rotate(${it.rotate}deg)` } as React.CSSProperties}>{it.text}</span>
      ))}
    </div>
  );
}
