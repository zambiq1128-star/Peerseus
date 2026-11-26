import { DoodleField } from "./Doodles";
import s from "./Login.module.css";

/**
 * Sign-in layout, monochrome world: white page, hair-thin pencil lines, a few quiet doodles, lots of empty space.
 * Only the look lives here; Shell passes the card content (sign-in buttons or the first-run profile form).
 */
export default function LoginScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className={`world-mono ${s.root}`}>
      <DoodleField spots={[
        { kind: "cloud", fill: "none", x: "14%", y: "12%", size: 56, rot: -4, float: true },
        { kind: "sparkle", fill: "none", x: "80%", y: "18%", size: 26, delay: 1 },
        { kind: "moon", fill: "none", x: "86%", y: "70%", size: 40, rot: 14, float: true, delay: 2 },
        { kind: "spiral", fill: "none", x: "8%", y: "74%", size: 38, rot: -12, delay: 3 },
        { kind: "star", fill: "none", x: "46%", y: "92%", size: 20, rot: 8, delay: 1.6 },
      ]} />

      <main className={s.inner}>
        <h1 className={`${s.title} animate-slide-left`}>
          <span className={s.line1}>Welcome to</span>
          <span className={s.line2}>Peerseus.</span>
        </h1>
        <p className={`${s.sub} animate-slide-left`}>Engage your Academic Odyssey.</p>
        <div className={`${s.cardWrap} animate-slide-right`}>
          <div className="card">{children}</div>
        </div>
      </main>
    </div>
  );
}

export const loginStyles = s;
