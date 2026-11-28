"use client";
import { db, serverNow, syncServerClock } from "./db";
import { applyActivity, displayCurrent, streakMessage, wibDay, type Streak, type StreakKind } from "./streak";
import type { UserProfile } from "./types";

export type ActivityResult = { kind: StreakKind; streak: Streak; message: string | null };

/**
 * Records that `uid` did something that counts for the streak (a finished duel, a handed-in practice run,
 * a posted discussion answer). Safe to call many times: the same WIB day changes nothing.
 * The day comes from the server's clock (`at` = an earlier server time, e.g. when the duel finished).
 * Only the `streak` field of users/{uid} is written, in one transaction, so nothing else in the profile is touched.
 */
export async function recordActivity(uid: string, at?: number): Promise<ActivityResult | null> {
  await syncServerClock();
  const day = wibDay(at ?? serverNow());
  return db.transaction(async (tx) => {
    const u = await tx.get<UserProfile>("users", uid);
    if (!u) return null;
    const { streak, kind } = applyActivity(u.streak, day);
    if (kind !== "same") tx.update("users", uid, { streak });
    return { kind, streak, message: streakMessage(kind, streak.current) };
  });
}

/** Never let a failed streak write break the action that triggered it. */
export function recordActivityQuietly(uid: string, at?: number): Promise<ActivityResult | null> {
  return recordActivity(uid, at).catch((e) => {
    console.warn("[streak] not recorded", e);
    return null;
  });
}

/** The streak number to show right now for a profile (0 when it has lapsed). */
export const currentStreakOf = (p: Pick<UserProfile, "streak"> | null | undefined) => displayCurrent(p?.streak, wibDay(serverNow()));
