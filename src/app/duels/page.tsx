"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { canDecline, isMyTurn, myDuels } from "@/lib/peerseus";
import type { Duel } from "@/lib/types";
import DeclineDuel from "@/components/DeclineDuel";
import { CollapsibleRows, Empty, ErrorState, Page, PageHeader, Spinner, timeAgo, useAsync } from "@/components/ui";

export default function Duels() {
  const { profile } = useAuth();
  const uid = profile!.id;
  const { data, error, reload } = useAsync(() => myDuels(uid), [uid]);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  return (
    <Page>
      <PageHeader title="Duel" sub="Tantangan masuk dan riwayat duelmu." />
      {data.length === 0 && <Empty title="Belum ada duel" action={<Link href="/" className="btn-primary">Ke mata kuliahku</Link>}>Buka mata kuliah, lalu klik “Mulai duel”.</Empty>}
      {data.length > 0 && (
        <CollapsibleRows items={data.filter((d) => !isMyTurn(d, uid))} pinned={data.filter((d) => isMyTurn(d, uid)).map((d) => <DuelRow key={d.id} d={d} uid={uid} onChange={reload} />)}>
          {(d) => <DuelRow key={d.id} d={d} uid={uid} onChange={reload} />}
        </CollapsibleRows>
      )}
    </Page>
  );
}

// Duels waiting on my answer (isMyTurn) are pinned above the collapsible history.
function DuelRow({ d, uid, onChange }: { d: Duel; uid: string; onChange: () => void }) {
  const meC = d.challengerId === uid;
  const opp = meC ? d.opponentName : d.challengerName;
  const myTurn = isMyTurn(d, uid);
  const mine = meC ? d.challenger : d.opponent;
  const theirs = meC ? d.opponent : d.challenger;
  const label = d.status === "declined" ? "Ditolak" : myTurn ? "Giliranmu" : d.status === "pending" ? "Menunggu lawan" : d.winnerId === uid ? "Menang" : d.winnerId === null ? "Seri" : "Kalah";
  const badge = d.status === "declined" ? "badge" : myTurn ? "badge-strong" : d.status === "pending" ? "badge" : d.winnerId === uid ? "badge-good" : d.winnerId === null ? "badge" : "badge-bad";
  const link = (
    <Link key={d.id} href={`/duel/${d.id}`} className="row-link min-w-0 flex-1">
      <div className="min-w-0">
        <div className="font-medium">vs {opp} <span className="text-xs font-normal text-muted">· {meC ? "kamu menantang" : "menantangmu"}</span></div>
        <div className="text-xs text-muted">{d.quizTitle} · {timeAgo(d.createdAt)}</div>
      </div>
      <div className="flex shrink-0 items-center gap-3 whitespace-nowrap">
        {mine && <span className="text-sm font-bold">{mine.score} – {theirs ? theirs.score : "?"}</span>}
        <span className={badge}>{label}</span>
      </div>
    </Link>
  );
  if (!canDecline(d, uid)) return link;
  // The decline button sits beside the link, not inside it (no button inside an anchor).
  return (
    <div key={d.id} className="flex flex-wrap items-center sm:flex-nowrap">
      {link}
      <DeclineDuel duelId={d.id} uid={uid} onDone={onChange} className="justify-end px-4 pb-3 sm:pb-0 sm:pl-0" />
    </div>
  );
}
