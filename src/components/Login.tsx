/* eslint-disable @next/next/no-img-element -- a small static logo; next/image adds nothing here */
import s from "./Login.module.css";

/** n design pixels of the 1440 x 1024 Figma frame, scaled to the window (see Login.module.css). */
const u = (n: number) => `calc(${n} * var(--u))`;

/** Colored blocks on the hero: x, y, width, height in the frame, top-left and bottom-right color. */
const BLOCKS = [
  { x: 640, y: 68, w: 265, h: 324, from: "#b79680", to: "#c6a189" },  // peach
  { x: 465, y: 320, w: 175, h: 280, from: "#a39b9f", to: "#ada3a6" },  // mauve
  { x: 640, y: 418, w: 216, h: 328, from: "#6a909c", to: "#7b9da5" },  // teal
  { x: 225, y: 662, w: 415, h: 227, from: "#9da7af", to: "#b8bcbe" },  // grey
  { x: 89, y: 186, w: 376, h: 476, from: "#68917a", to: "#789e86" },   // green
];

/** Thin lines under each word; they run to the hero's right edge and go on in the panel. */
const LINES = [
  { x: 89, y: 343 },
  { x: 370, y: 417 },
  { x: 456, y: 498 },
];

/** Words by left edge and baseline. With line-height 1 the Roboto Mono baseline sits 0.888 em below the top. */
const WORDS = [
  { text: "Welcome.", x: 103, baseline: 325 },
  { text: "To.", x: 379, baseline: 403 },
  { text: "Peerseus.", x: 476, baseline: 481 },
];

/**
 * Sign-in layout from the friend's Figma design: hero on the left, logo + tagline + card on the right.
 * Only the look lives here; Shell passes the card content (sign-in buttons or the first-run profile form).
 */
export default function LoginScreen({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <div className={s.root}>
      <div className={s.hero} aria-hidden="true">
        <div className={s.stage}>
          {BLOCKS.map((b) => (
            <div key={b.x + "," + b.y} className={s.block}
              style={{ left: u(b.x), top: u(b.y), width: u(b.w), height: u(b.h), background: `linear-gradient(135deg, ${b.from}, ${b.to})` }} />
          ))}
          {LINES.map((l) => (
            <div key={l.y} className={s.line} style={{ left: u(l.x), right: "-100vw", top: u(l.y) }} />
          ))}
          {WORDS.map((w) => (
            <p key={w.text} className={s.word} style={{ left: u(w.x), top: u(w.baseline - 0.888 * 60) }}>{w.text}</p>
          ))}
        </div>
      </div>

      <main className={s.side}>
        <div className={s.sideInner}>
          <img src="/peerseus-logo.png" alt="Peerseus" width={281} height={253} className={s.logo} />
          <h1 className="sr-only">Welcome to Peerseus. Engage your academic odyssey.</h1>
          <p className={`${s.tag} ${s.tagTop}`} aria-hidden="true">Engage Your:</p>
          <p className={`${s.tag} ${s.tagBottom}`} aria-hidden="true">Academic Odyssey</p>
          <div className={`${s.card} ${compact ? s.cardLogin : ""}`}>{children}</div>
        </div>
      </main>
    </div>
  );
}

export const loginStyles = s;
