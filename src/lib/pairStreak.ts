// Streak duel dengan teman: berapa hari WIB berturut-turut dua orang menyelesaikan minimal satu duel satu sama lain.
// Tidak disimpan di mana pun; dihitung dari koleksi `duels` (status completed, dua manusia, tanpa perisai).
// Bagian murni (tanpa Firebase) ada di atas supaya bisa dites dengan `npm test`.
import { addDays, daysBetween, wibDay } from "./streak.ts";

export type PairStreakResult = {
  /** Running streak; 0 when the last day was before yesterday. */
  current: number;
  /** Longest run ever. */
  best: number;
  /** Alive, but the last duel was yesterday: a duel today keeps it going. */
  atRisk: boolean;
  /** Last WIB day with a duel together. */
  lastDay?: string;
};

/**
 * `days` = WIB days ("YYYY-MM-DD") on which the pair finished a duel (duplicates and any order are fine),
 * `today` = today's WIB day. Alive when the last day is today or yesterday.
 */
export function computePairStreak(days: string[], today: string): PairStreakResult {
  const set = [...new Set(days)].filter((d) => d <= today).sort();
  if (!set.length) return { current: 0, best: 0, atRisk: false };
  let best = 1;
  let run = 1;
  for (let i = 1; i < set.length; i++) {
    run = daysBetween(set[i - 1], set[i]) === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  const lastDay = set[set.length - 1];
  const alive = daysBetween(lastDay, today) <= 1;
  return { current: alive ? run : 0, best, atRisk: alive && lastDay === addDays(today, -1), lastDay };
}

export type PairStreak = PairStreakResult & {
  /** Completed duels together on `today` (WIB). 1 = the duel that just finished is the first of the day. */
  todayDuels: number;
};

type DuelLike = {
  status: string;
  challengerId: string;
  opponentId: string;
  opponentIsBot?: boolean;
  completedAt?: number;
};

const isBotId = (id: string) => id.startsWith("bot_");

/** Groups my completed duels with other people by friend: WIB days, and how many were on `today`. */
export function groupPairDays(duels: DuelLike[], myUid: string, today: string): Map<string, { days: string[]; todayDuels: number }> {
  const out = new Map<string, { days: string[]; todayDuels: number }>();
  for (const d of duels) {
    if (d.status !== "completed" || d.opponentIsBot || typeof d.completedAt !== "number") continue; // old duels have no completedAt
    const friend = d.challengerId === myUid ? d.opponentId : d.opponentId === myUid ? d.challengerId : null;
    if (!friend || friend === myUid || isBotId(friend)) continue;
    const day = wibDay(d.completedAt);
    const g = out.get(friend) ?? { days: [], todayDuels: 0 };
    g.days.push(day);
    if (day === today) g.todayDuels++;
    out.set(friend, g);
  }
  return out;
}

/** Pair streaks with every person I have finished a duel with (bots and unfinished duels ignored). One query, no per-friend reads. */
export async function loadMyPairStreaks(myUid: string): Promise<Map<string, PairStreak>> {
  // Dynamic imports keep the pure part above loadable by node --test (no Firebase).
  const { db, serverNow, syncServerClock } = await import("./db");
  await syncServerClock();
  const today = wibDay(serverNow());
  // Same query as myDuels(): `participants` always holds both uids and rules let any signed-in user read duels.
  const duels = await db.list<DuelLike>("duels", [["participants", "array-contains", myUid]]);
  const out = new Map<string, PairStreak>();
  for (const [friend, g] of groupPairDays(duels, myUid, today)) {
    out.set(friend, { ...computePairStreak(g.days, today), todayDuels: g.todayDuels });
  }
  return out;
}
