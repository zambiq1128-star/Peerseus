"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { myDuels } from "@/lib/peerseus";
import type { Duel } from "@/lib/types";
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
        <CollapsibleRows items={data.filter((d) => !isMyTurn(d, uid))} pinned={data.filter((d) => isMyTurn(d, uid)).map((d) => <DuelRow key={d.id} d={d} uid={uid} />)}>
          {(d) => <DuelRow key={d.id} d={d} uid={uid} />}
        </CollapsibleRows>
      )}
    </Page>
  );
}

/** A duel waiting on my answer: always shown above the collapsible history. */
function isMyTurn(d: Duel, uid: string) {
  return d.status === "pending" && !(d.challengerId === uid ? d.challenger : d.opponent);
}

function DuelRow({ d, uid }: { d: Duel; uid: string }) {
  const meC = d.challengerId === uid;
  const opp = meC ? d.opponentName : d.challengerName;
  const myTurn = isMyTurn(d, uid);
  const mine = meC ? d.challenger : d.opponent;
  const theirs = meC ? d.opponent : d.challenger;
  const label = myTurn ? "Giliranmu" : d.status === "pending" ? "Menunggu lawan" : d.winnerId === uid ? "Menang" : d.winnerId === null ? "Seri" : "Kalah";
  const badge = myTurn ? "badge-strong" : d.status === "pending" ? "badge" : d.winnerId === uid ? "badge-good" : d.winnerId === null ? "badge" : "badge-bad";
  return (
    <Link key={d.id} href={`/duel/${d.id}`} className="row-link">
      <div>
        <div className="font-medium">vs {opp} <span className="text-xs font-normal text-muted">· {meC ? "kamu menantang" : "menantangmu"}</span></div>
        <div className="text-xs text-muted">{d.quizTitle} · {timeAgo(d.createdAt)}</div>
      </div>
      <div className="flex items-center gap-3">
        {mine && <span className="text-sm font-bold">{mine.score} – {theirs ? theirs.score : "?"}</span>}
        <span className={badge}>{label}</span>
      </div>
    </Link>
  );
}
