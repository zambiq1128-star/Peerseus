import type { ElementType } from "react";

/**
 * "Ransom note" heading: every letter is its own cut-out tile with its own font, size, tilt and
 * background (white / blue / black). The mix looks random but is deterministic per text (same text =
 * same heading on server and client, so hydration is safe). Use it for big headings only; body text
 * stays in the plain sans font.
 *
 * Accessibility: screen readers get the plain text (sr-only); the tiles are aria-hidden.
 * Use "\n" in `text` for a forced line break.
 */

// next/font variables set on <html> in layout.tsx. Bebas Neue has capitals only, so the text is uppercased.
const FONTS = ["var(--font-anton)", "var(--font-bebas)", "var(--font-archivo)", "var(--font-oswald)"];
const TILES = ["white", "blue", "black"] as const;

/** FNV-1a hash -> mulberry32: a tiny seeded random generator. */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function Ransom({ text, as: Tag = "span", className = "" }: { text: string; as?: ElementType; className?: string }) {
  const rand = rng(text);
  let prevFont = -1;
  let prevTile = -1;
  const lines = text.toUpperCase().split("\n").map((line) =>
    line.split(" ").filter(Boolean).map((word) =>
      [...word].map((ch) => {
        // Never repeat the previous font or tile, so neighbours always differ.
        const font = (prevFont + 1 + Math.floor(rand() * (FONTS.length - 1)) + FONTS.length) % FONTS.length;
        const tile = (prevTile + 1 + Math.floor(rand() * (TILES.length - 1)) + TILES.length) % TILES.length;
        prevFont = font;
        prevTile = tile;
        return { ch, font, tile, size: 0.88 + rand() * 0.26, rot: (rand() * 12 - 6).toFixed(1), dy: ((rand() - 0.5) * 0.14).toFixed(3) };
      }),
    ),
  );

  return (
    <Tag className={`ransom ${className}`}>
      <span className="sr-only">{text.replace(/\n/g, " ")}</span>
      <span aria-hidden="true" className="block">
        {lines.map((words, li) => (
          <span key={li} className="ransom-line">
            {words.map((letters, wi) => (
              <span key={wi} className="ransom-word">
                {letters.map((l, i) => (
                  <span
                    key={i}
                    className="ransom-l"
                    data-tile={TILES[l.tile]}
                    style={{ fontFamily: FONTS[l.font], fontSize: `${l.size}em`, transform: `translateY(${l.dy}em) rotate(${l.rot}deg)` }}
                  >
                    {l.ch}
                  </span>
                ))}
              </span>
            ))}
          </span>
        ))}
      </span>
    </Tag>
  );
}
