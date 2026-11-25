/* eslint-disable @next/next/no-img-element -- a small static logo; next/image adds nothing here */
import s from "./Login.module.css";

/**
 * Sign-in layout (JRPG menu look): logo and giant headline on the left, the card on the right; stacked on phones.
 * Only the look lives here; Shell passes the card content (sign-in buttons or the first-run profile form).
 */
export default function LoginScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className={s.root}>
      <div className={s.deco} aria-hidden="true">
        <div className={s.slab} />
        <div className={s.sliver} />
        <div className={s.lines} />
      </div>

      <main className={s.inner}>
        <div>
          <img src="/peerseus-logo.png" alt="Peerseus" width={281} height={253} className={`${s.logo} animate-slide-left`} />
          <h1 className={s.title}>
            <span className={s.line1}>Welcome to</span>
            <span className={s.line2}>Peerseus.</span>
          </h1>
          <p className={s.sub}>Engage your Academic Odyssey.</p>
        </div>
        <div className={s.cardWrap}>
          <div className={s.card}>{children}</div>
        </div>
      </main>
    </div>
  );
}

export const loginStyles = s;
