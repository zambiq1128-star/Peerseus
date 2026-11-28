"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { serverNow } from "@/lib/db";
import { useQuery, useServerOffset } from "@/lib/live";
import { acceptInvite, clock, expireInvite, inviteMsLeft, isActiveInvite } from "@/lib/peerseus";
import type { PairStreak } from "@/lib/pairStreak";
import type { Duel } from "@/lib/types";
import { usePairStreaks } from "./Streak";
import DeclineDuel from "./DeclineDuel";

/** Server time, re-read every `ms` while `on` (so countdowns move and invites past 2 minutes disappear). */
export function useNow(on = true, ms = 1000) {
  useServerOffset();
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!on) return;
    const iv = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(iv);
  }, [on, ms]);
  return on ? now : serverNow();
}

/**
 * Invites sent to me that are still waiting for an answer, live. Invites past 2 minutes are left out
 * and marked "expired" (once each), so the challenger's list shows the same.
 */
export function useIncomingInvites(uid: string | null | undefined) {
  const { data } = useQuery<Duel>("duels", uid ? [["opponentId", "==", uid], ["status", "==", "invited"]] : null);
  const now = useNow(data.length > 0);
  const marked = useRef(new Set<string>());
  const stale = data.filter((d) => !isActiveInvite(d, now)).map((d) => d.id).join(",");
  useEffect(() => {
    for (const id of stale.split(",").filter(Boolean)) {
      if (marked.current.has(id)) continue;
      marked.current.add(id);
      void expireInvite(id);
    }
  }, [stale]);
  const invites = data.filter((d) => isActiveInvite(d, now)).sort((a, b) => (b.invitedAt ?? 0) - (a.invitedAt ?? 0));
  // Pair streaks are only loaded while someone is waiting for my answer.
  const pairs = usePairStreaks(uid, invites.length > 0);
  return { invites, now, pairs };
}

/** "Terima" (goes to the duel) and "Tolak" (with its confirm step) for one incoming invite. */
export function InviteActions({ duel, uid, className = "" }: { duel: Duel; uid: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function accept() {
    setBusy(true);
    setError("");
    try {
      await acceptInvite(duel.id, uid);
      router.push(`/duel/${duel.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menerima ajakan");
      setBusy(false);
    }
  }
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button type="button" className="btn-primary !py-1.5" disabled={busy} onClick={accept}>{busy ? "Menerima…" : "Terima"}</button>
      <DeclineDuel duelId={duel.id} uid={uid} onDone={() => undefined} />
      {error && <span className="w-full text-xs text-bad">{error}</span>}
    </div>
  );
}

/** One line about an incoming invite: who, which quiz, time left. */
export function InviteText({ duel, now, pairs }: { duel: Duel; now: number; pairs?: Map<string, PairStreak> }) {
  const days = pairs?.get(duel.challengerId)?.current ?? 0;
  return (
    <div className="min-w-0">
      <div className="font-semibold">
        {duel.challengerName} mengajakmu duel
        {days > 0 && <span className="whitespace-nowrap"> · <span aria-hidden>🔥 </span>{days} hari</span>}
      </div>
      <div className="text-xs text-muted">
        {duel.quizTitle} · sisa <span className="tabular-nums">{clock(inviteMsLeft(duel, now))}</span>
      </div>
    </div>
  );
}

/**
 * Banner on every signed-in page while someone is waiting for my answer. Not where the page itself
 * shows the invite with the same buttons: the home page, /duels and the invite's own page.
 */
export default function InviteBanner({ uid, path }: { uid: string; path: string }) {
  const { invites, now, pairs } = useIncomingInvites(uid);
  const shown = invites.filter((d) => path !== `/duel/${d.id}`);
  if (path === "/" || path === "/duels" || shown.length === 0) return null;
  const d = shown[0];
  return (
    <div role="status" aria-live="polite" className="callout fixed inset-x-4 bottom-4 z-30 animate-slide-right space-y-3 sm:left-auto sm:w-[26rem]">
      <InviteText duel={d} now={now} pairs={pairs} />
      <InviteActions key={d.id} duel={d} uid={uid} />
      {shown.length > 1 && <p className="text-xs">+{shown.length - 1} ajakan lain di halaman Duel.</p>}
    </div>
  );
}
