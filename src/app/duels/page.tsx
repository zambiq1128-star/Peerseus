"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@/lib/live";
import { clock, duelState, inviteMsLeft, type DuelState } from "@/lib/peerseus";
import type { Duel } from "@/lib/types";
import { InviteActions, InviteText, useIncomingInvites, useNow } from "@/components/DuelInvites";
import { CollapsibleRows, Empty, ErrorState, Page, PageHeader, Section, Spinner, timeAgo } from "@/components/ui";

export default function Duels() {
  const { profile } = useAuth();
  const uid = profile!.id;
  const { data, loading, error } = useQuery<Duel>("duels", [["participants", "array-contains", uid]]);
  const { invites, now: inviteNow } = useIncomingInvites(uid);
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
      <PageHeader title="Duel" sub="Ajakan masuk dan riwayat duelmu." />
      {invites.length > 0 && (
        <Section title={`Ajakan masuk (${invites.length})`}>
          <div className="rows">
            {invites.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <InviteText duel={d} now={inviteNow} />
                <InviteActions duel={d} uid={uid} />
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
  const opp = meC ? d.opponentName : d.challengerName;
  const mine = meC ? d.challenger : d.opponent;
  const theirs = meC ? d.opponent : d.challenger;
  const s = duelState(d, now);
  const open = isOpen(d, uid, now);
  const label = s === "completed" ? (d.winnerId === uid ? "Menang" : d.winnerId === null ? "Seri" : "Kalah")
    : (s === "ready" || s === "playing") && mine ? "Menunggu lawan"
    : s === "invited" ? `${LABEL.invited} · ${clock(inviteMsLeft(d, now))}`
    : LABEL[s];
  const badge = s === "completed" ? (d.winnerId === uid ? "badge-good" : d.winnerId === null ? "badge" : "badge-bad") : open ? "badge-strong" : "badge";
  return (
    <Link href={`/duel/${d.id}`} className="row-link">
      <div>
        <div className="font-medium">vs {opp} <span className="text-xs font-normal text-muted">· {meC ? "kamu menantang" : "menantangmu"}</span></div>
        <div className="text-xs text-muted">{d.quizTitle} · {timeAgo(d.createdAt)}</div>
      </div>
      <div className="flex items-center gap-3">
        {mine && <span className="text-sm font-bold">{mine.score} – {theirs ? theirs.score : "?"}</span>}
        <span className={`${badge} tabular-nums`}>{label}</span>
      </div>
    </Link>
  );
}
