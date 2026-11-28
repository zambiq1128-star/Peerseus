// Streak harian: pure rules (no Firebase, no React), so they can be tested with `npm test`.
// A day counts when the user finishes a duel, hands in a solo practice run or posts a discussion answer.
// Days are WIB (Asia/Jakarta, UTC+7, no daylight saving) calendar days, "YYYY-MM-DD", taken from the server's clock.
// One shield per WIB week (Monday start) saves the streak when exactly one day was missed.

export type Streak = {
  current: number;
  best: number;
  /** Last day with a recorded activity (WIB). */
  lastDay: string;
  /** Monday (WIB) of the week in which the shield was last used. */
  shieldWeek?: string;
  /** Days with an activity, newest last, only the last 7 days up to lastDay. */
  recentDays?: string[];
  /** Days the shield covered, same window. */
  shieldDays?: string[];
};

export type StreakKind =
  /** First activity ever, or a new streak after a break. */
  | "start"
  /** Activity on the day after lastDay. */
  | "extended"
  /** One day was missed and this week's shield covered it. */
  | "shield"
  /** Already recorded for this day (or an older one): nothing changed. */
  | "same";

const DAY_MS = 86_400_000;
const WIB_MS = 7 * 3_600_000;

/** WIB calendar day ("YYYY-MM-DD") of a moment in epoch ms. */
export function wibDay(ms: number): string {
  return new Date(ms + WIB_MS).toISOString().slice(0, 10);
}

const dayNumber = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};
const fromDayNumber = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** Whole days from `a` to `b` (positive when b is later). */
export const daysBetween = (a: string, b: string) => dayNumber(b) - dayNumber(a);
export const addDays = (day: string, n: number) => fromDayNumber(dayNumber(day) + n);

/** Monday of the week (Monday to Sunday) that holds `day`. */
export function weekOf(day: string): string {
  const n = dayNumber(day);
  return fromDayNumber(n - ((n + 3) % 7)); // 1970-01-01 was a Thursday
}

/** Can the shield still be used in the week of `day`? */
export const shieldAvailable = (s: Streak | null | undefined, day: string) => s?.shieldWeek !== weekOf(day);

const keepRecent = (days: string[] | undefined, last: string) => (days ?? []).filter((d) => daysBetween(d, last) <= 6 && d <= last).sort();

/** Applies an activity on WIB day `day`. Returns the new streak and what happened. Never changes the input. */
export function applyActivity(prev: Streak | null | undefined, day: string): { streak: Streak; kind: StreakKind } {
  if (!prev || !prev.lastDay) {
    return { streak: { current: 1, best: 1, lastDay: day, recentDays: [day] }, kind: "start" };
  }
  const gap = daysBetween(prev.lastDay, day);
  if (gap <= 0) return { streak: prev, kind: "same" };

  let current = 1;
  let kind: StreakKind = "start";
  let shieldWeek = prev.shieldWeek;
  let shieldDays = prev.shieldDays ?? [];
  if (gap === 1) {
    current = prev.current + 1;
    kind = "extended";
  } else if (gap === 2 && shieldAvailable(prev, day)) {
    current = prev.current + 1;
    kind = "shield";
    shieldWeek = weekOf(day);
    shieldDays = [...shieldDays, addDays(prev.lastDay, 1)];
  }
  const streak: Streak = {
    current,
    best: Math.max(prev.best, current),
    lastDay: day,
    ...(shieldWeek && { shieldWeek }),
    recentDays: keepRecent([...(prev.recentDays ?? []), day], day),
    shieldDays: keepRecent(shieldDays, day),
  };
  if (!streak.shieldDays!.length) delete streak.shieldDays;
  return { streak, kind };
}

/**
 * The streak to show on `today` (WIB day), even if the document was not updated: 0 when more than a day
 * was missed and the shield could not save it (no shield left this week, or two or more days missed).
 */
export function displayCurrent(s: Streak | null | undefined, today: string): number {
  if (!s || !s.lastDay) return 0;
  const gap = daysBetween(s.lastDay, today);
  if (gap <= 1) return s.current;
  if (gap === 2 && shieldAvailable(s, today)) return s.current;
  return 0;
}

export type DayDot = { day: string; state: "done" | "shield" | "empty"; today: boolean };

/** The last 7 days up to and including `today`, oldest first. */
export function lastSevenDays(s: Streak | null | undefined, today: string): DayDot[] {
  const done = new Set(s?.recentDays ?? []);
  const shield = new Set(s?.shieldDays ?? []);
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6);
    return { day, state: shield.has(day) ? "shield" : done.has(day) ? "done" : "empty", today: i === 6 };
  });
}

/** Was something recorded today? */
export const recordedToday = (s: Streak | null | undefined, today: string) => s?.lastDay === today;

/** Short message for the result screens; null when nothing changed. */
export function streakMessage(kind: StreakKind, current: number): string | null {
  if (kind === "same") return null;
  if (kind === "shield") return `🛡️ Perisai terpakai, streak ${current} hari tetap aman`;
  return `🔥 Streak ${current} hari!`;
}
