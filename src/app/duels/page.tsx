"use client";
import { displayOpponentName } from "@/lib/bots";
import Link from "next/link";
import { useState } from "react";
import { db } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@/lib/live";
import { clock, decidedByTime, duelState, inviteMsLeft, type DuelState } from "@/lib/peerseus";
import type { Course, Duel } from "@/lib/types";
import { InviteActions, InviteText, useIncomingInvites, useNow } from "@/components/DuelInvites";
import { CollapsibleRows, Empty, ErrorState, Page, PageHeader, Section, Spinner, timeAgo, useAsync } from "@/components/ui";

export default function Duels() {
  const { profile } = useAuth();
  const uid = profile!.id;
  const { data, loading, error } = useQuery<Duel>("duels", [["participants", "array-contains", uid]]);
  const { invites, now: inviteNow, pairs } = useIncomingInvites(uid);
  const waiting = data.some((d) => d.status === "invited");
  const now = useNow(waiting);
  if (error) return <ErrorState message={error.message} onRetry={() => location.reload()} />;
  if (loading) return <Spinner />;
  const incoming = new Set(invites.map((d) => d.id));
  // Duels still going on for me (my invite waiting, or accepted and not played yet) stay above the history.
  const live = (d: Duel) => !incoming.has(d.id) && isOpen(d, uid, now);
  const sorted = [...data].sort((a, b) => b.createdAt - a.createdAt);
  return (
    <Page>
      <PageHeader title="Duel" sub="Ajakan masuk dan riwayat duelmu." action={<StartDuel courseIds={profile!.courseIds} />} />
      {invites.length > 0 && (
        <Section title={`Ajakan masuk (${invites.length})`}>
          <div className="rows">
            {invites.map((d) => (
              <div key={d.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <InviteText duel={d} now={inviteNow} pairs={pairs} />
                <InviteActions duel={d} uid={uid} className="shrink-0" />
              </div>
            ))}
          </div>
        </Section>
      )}
      {sorted.length === 0 && <Empty title="Belum ada duel" action={<Link href="/" className="btn-primary">Ke mata kuliahku</Link>}>Buka mata kuliah, lalu klik “Mulai duel”.</Empty>}
      {sorted.filter((d) => !incoming.has(d.id)).length > 0 && (
        <CollapsibleRows items={sorted.filter((d) => !incoming.has(d.id) && !live(d))} pinned={sorted.filter(live).map((d) => <DuelRow key={d.id} d={d} uid={uid} now={now} />)}>
          {(d) => <DuelRow key={d.id} d={d} uid={uid} now={now} />}
        </CollapsibleRows>
      )}
    </Page>
  );
}

/** Header action: start a duel. /duel/new needs a course, so with several courses I pick one first. */
function StartDuel({ courseIds }: { courseIds: string[] }) {
  const { data } = useAsync(async () => {
    const all = await db.list<Course>("courses");
    return all.filter((c) => courseIds.includes(c.id)).sort((a, b) => a.code.localeCompare(b.code));
  }, [courseIds.join(",")]);
  const [picked, setPicked] = useState("");
  if (!data) return null;
  if (!data.length) return <Link href="/courses" className="btn-primary">Atur mata kuliah</Link>;
  const course = data.find((c) => c.id === picked) ?? data[0];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {data.length > 1 && (
        <select aria-label="Mata kuliah untuk duel" className="input !w-auto" value={course.id} onChange={(e) => setPicked(e.target.value)}>
          {data.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
        </select>
      )}
      <Link href={`/duel/new?course=${course.id}`} className="btn-primary">Mulai duel</Link>
    </div>
  );
}

/** Not finished and still needs me: my invite is waiting, or it was accepted and I haven't played. */
function isOpen(d: Duel, uid: string, now: number) {
  const s = duelState(d, now);
  const mine = d.challengerId === uid ? d.challenger : d.opponent;
  return s === "invited" || ((s === "ready" || s === "playing") && !mine);
}

const LABEL: Record<DuelState, string> = {
  invited: "Menunggu jawaban",
  ready: "Siap main",
  playing: "Sedang main",
  completed: "",
  declined: "Ditolak",
  expired: "Kedaluwarsa",
  cancelled: "Dibatalkan",
};

function DuelRow({ d, uid, now }: { d: Duel; uid: string; now: number }) {
  const meC = d.challengerId === uid;
  const opp = displayOpponentName(d, meC ? d.opponentId : d.challengerId);
  const mine = meC ? d.challenger : d.opponent;
  const theirs = meC ? d.opponent : d.challenger;
  const s = duelState(d, now);
  const open = isOpen(d, uid, now);
  // Equal scores but a winner: it was decided by time, so say so ("3 – 3 Kalah" alone looks like a bug).
  const byTime = decidedByTime(d) ? " · waktu" : "";
  const label = s === "completed" ? (d.winnerId === uid ? "Menang" : d.winnerId === null ? "Seri" : "Kalah") + (d.winnerId ? byTime : "")
    : (s === "ready" || s === "playing") && mine ? "Menunggu lawan"
    : s === "invited" ? `${LABEL.invited} · ${clock(inviteMsLeft(d, now))}`
    : LABEL[s];
  const badge = s === "completed" ? (d.winnerId === uid ? "badge-good" : d.winnerId === null ? "badge" : "badge-bad") : open ? "badge-strong" : "badge";
  return (
    <Link href={`/duel/${d.id}`} className="row-link">
      <div className="min-w-0">
        <div className="truncate font-medium">vs {opp}</div>
        {/* Pieces stay on one line; " · " is the only place the line may wrap. A very long quiz title is cut with "…" instead of pushing the score aside. */}
        <div className="text-xs text-muted">
          <span className="whitespace-nowrap">{meC ? "kamu menantang" : "menantangmu"}</span> · <span className="inline-block max-w-full truncate align-bottom">{d.quizTitle}</span> · <span className="whitespace-nowrap">{timeAgo(d.createdAt)}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 whitespace-nowrap">
        {mine && <span className="text-sm font-bold">{mine.score} – {theirs ? theirs.score : "?"}</span>}
        <span className={`${badge} tabular-nums`}>{label}</span>
      </div>
    </Link>
  );
}
