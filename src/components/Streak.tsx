"use client";
import { serverNow } from "@/lib/db";
import { useDoc } from "@/lib/live";
import {
  displayCurrent, lastSevenDays, recordedToday, shieldAvailable, wibDay, type Streak,
} from "@/lib/streak";
import type { UserProfile } from "@/lib/types";

// Streak harian (aturan di src/lib/streak.ts). Hanya token dan kelas bersama; ikon api dan perisai berupa emoji.

/** Live streak of a user: the stored value, plus the honest number to show today (0 once it has lapsed). */
export function useStreak(uid: string | null | undefined) {
  const { data } = useDoc<UserProfile>("users", uid);
  return streakView(data?.streak);
}

export function streakView(streak: Streak | null | undefined) {
  const today = wibDay(serverNow());
  return {
    streak: streak ?? null,
    today,
    current: displayCurrent(streak, today),
    best: Math.max(streak?.best ?? 0, displayCurrent(streak, today)),
    doneToday: recordedToday(streak, today),
    shield: shieldAvailable(streak, today),
  };
}

/** Small flame + number beside the name in the top bar; renders nothing at 0. */
export function StreakBadge({ current }: { current: number }) {
  if (current <= 0) return null;
  return (
    <span title={`Streak ${current} hari`} aria-label={`Streak ${current} hari`}
      className="inline-flex shrink-0 items-center gap-0.5 font-display text-[13px] leading-none tracking-wider text-white sm:text-sm">
      <span aria-hidden>🔥</span><span className="tabular-nums">{current}</span>
    </span>
  );
}

const WEEKDAY = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const dayName = (day: string) => WEEKDAY[new Date(`${day}T00:00:00Z`).getUTCDay()];

/** Home card: running days, the last 7 days, today's status and this week's shield. */
export function StreakCard({ uid }: { uid: string }) {
  const v = useStreak(uid);
  const dots = lastSevenDays(v.streak, v.today);
  return (
    <section aria-labelledby="streak-title" className="card space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div id="streak-title" className="eyebrow">Streak</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span aria-hidden className="text-3xl">🔥</span>
            <span className="font-display text-5xl font-bold leading-none tabular-nums text-cyan">{v.current}</span>
            <span className="text-sm text-muted">hari berturut-turut</span>
          </div>
        </div>
        <div className="text-xs text-muted">Terpanjang: <b className="text-ink">{v.best} hari</b></div>
      </div>

      <ol aria-label="7 hari terakhir" className="flex justify-between gap-1">
        {dots.map((d) => {
          const label = `${dayName(d.day)}${d.today ? " (hari ini)" : ""}: ${d.state === "done" ? "tercatat" : d.state === "shield" ? "diselamatkan perisai" : d.today ? "belum" : "kosong"}`;
          return (
            <li key={d.day} className="flex flex-1 flex-col items-center gap-1" aria-label={label}>
              <span aria-hidden
                className={`grid h-8 w-8 place-items-center border-2 text-sm sm:h-9 sm:w-9 ${
                  d.state === "done" ? "border-white bg-accent text-on-accent"
                    : d.state === "shield" ? "border-white bg-white text-black"
                    : "border-line bg-black text-muted"
                } ${d.today ? "outline outline-2 outline-offset-2 outline-cyan" : ""}`}>
                {d.state === "done" ? "🔥" : d.state === "shield" ? "🛡️" : ""}
              </span>
              <span aria-hidden className={`text-[11px] font-bold uppercase ${d.today ? "text-cyan" : "text-muted"}`}>{dayName(d.day)}</span>
            </li>
          );
        })}
      </ol>

      <p className="text-sm" aria-live="polite">
        {v.doneToday ? <b className="text-cyan">Hari ini sudah tercatat.</b> : <span className="text-ink-soft">Selesaikan duel, latihan, atau jawab diskusi untuk menjaga streak.</span>}
      </p>
      <p className="text-xs text-muted">
        <span aria-hidden>🛡️ </span>Perisai minggu ini: <b className={v.shield ? "text-cyan" : "text-ink-soft"}>{v.shield ? "tersedia" : "terpakai"}</b>
        {" "}· menyelamatkan streak kalau kamu melewatkan satu hari.
      </p>
    </section>
  );
}

/** Running and longest streak (profile pages). Pass the stored streak; the running number lapses to 0 by itself. */
export function StreakStats({ streak }: { streak: Streak | null | undefined }) {
  const v = streakView(streak);
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2"><span aria-hidden>🔥</span>Streak berjalan <b className="font-display text-2xl tabular-nums text-cyan">{v.current}</b> hari</span>
      <span className="text-muted">Terpanjang <b className="text-ink">{v.best} hari</b></span>
    </div>
  );
}

/** One-line notice on result screens when today's activity was just recorded. */
export function StreakNotice({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return <p role="status" className="callout animate-slam text-center font-semibold">{message}</p>;
}
