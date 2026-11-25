"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { myDuels } from "@/lib/peerseus";
import { Empty, Page, PageHeader, Spinner, timeAgo, useAsync } from "@/components/ui";

export default function Duels() {
  const { profile } = useAuth();
  const uid = profile!.id;
  const { data } = useAsync(() => myDuels(uid), [uid]);
  if (!data) return <Spinner />;
  return (
    <Page>
      <PageHeader title="Duel" sub="Tantangan masuk dan riwayat duelmu." />
      {data.length === 0 && <Empty>Belum ada duel. Buka mata kuliah, lalu klik “Mulai duel”.</Empty>}
      <div className="rows empty:hidden">
        {data.map((d) => {
          const meC = d.challengerId === uid;
          const opp = meC ? d.opponentName : d.challengerName;
          const myTurn = d.status === "pending" && !(meC ? d.challenger : d.opponent);
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
        })}
      </div>
    </Page>
  );
}
