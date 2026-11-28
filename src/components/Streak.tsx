"use client";
import { useEffect, useState } from "react";
import { serverNow } from "@/lib/db";
import { loadMyPairStreaks, type PairStreak } from "@/lib/pairStreak";
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

// Streak duel dengan teman (aturan di src/lib/pairStreak.ts): dihitung dari duel milikku, tidak disimpan.

const NO_PAIRS = new Map<string, PairStreak>();

/** My pair streaks by friend uid, loaded once per page (one query, not one per friend). Empty until loaded or on failure. */
export function usePairStreaks(uid: string | null | undefined, enabled = true): Map<string, PairStreak> {
  const [s, setS] = useState<{ uid: string; map: Map<string, PairStreak> } | null>(null);
  useEffect(() => {
    if (!uid || !enabled) return;
    let live = true;
    loadMyPairStreaks(uid).then((map) => live && setS({ uid, map }), () => undefined);
    return () => {
      live = false;
    };
  }, [uid, enabled]);
  return s && s.uid === uid ? s.map : NO_PAIRS;
}

/** Tooltip / aria text for the pair streak badge ("Sekapal" = the streak of two friends dueling each other). */
export const sekapalLabel = (n: number) => `Sekapal: ${n} hari berturut-turut duel bersama`;

/** "⛵ N" beside a friend's name; renders nothing when the pair streak is not alive. */
export function PairStreakBadge({ streak }: { streak: PairStreak | null | undefined }) {
  if (!streak || streak.current <= 0) return null;
  return (
    <span title={sekapalLabel(streak.current)} aria-label={sekapalLabel(streak.current)}
      className="inline-flex shrink-0 items-center gap-0.5 font-display text-sm leading-none tracking-wider text-cyan">
      <span aria-hidden>⛵</span><span className="tabular-nums">{streak.current}</span>
    </span>
  );
}

/** Small dim hint under a friend's name when the streak ends today unless you duel. */
export function PairStreakHint({ streak }: { streak: PairStreak | null | undefined }) {
  if (!streak || streak.current <= 0 || !streak.atRisk) return null;
  return <span className="block text-xs text-muted">Duel hari ini supaya Sekapal nggak putus</span>;
}

/** Profile line: running and best pair streak. Nothing at 0 and 0. */
export function PairStreakStats({ streak }: { streak: PairStreak | null | undefined }) {
  if (!streak || (streak.current <= 0 && streak.best <= 0)) return null;
  return (
    <div className="card flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
      <span className="flex items-center gap-2">
        <span aria-hidden>⛵</span>Sekapal kalian: <b className="font-display text-2xl tabular-nums text-cyan">{streak.current}</b> hari
      </span>
      <span className="text-muted">Terbaik: <b className="text-ink">{streak.best}</b></span>
      <span className="w-full text-xs text-muted">Hari berturut-turut kalian saling duel.</span>
      {streak.atRisk && <span className="w-full text-xs text-muted">Duel hari ini supaya Sekapal nggak putus</span>}
    </div>
  );
}

/** Result screen line for a human duel. `+1 hari` when this duel is the first of today (it raised the streak). */
export function PairStreakResult({ name, streak, raised }: { name: string; streak: PairStreak | null | undefined; raised: boolean }) {
  if (!streak || streak.current <= 0) return null;
  return (
    <p role="status" className="callout text-center font-semibold">
      <span aria-hidden>⛵ </span>Sekapal dengan {name}: <span className="tabular-nums">{streak.current}</span> hari
      {raised && <span className="ml-2 text-sm font-bold">+1 hari</span>}
    </p>
  );
}
