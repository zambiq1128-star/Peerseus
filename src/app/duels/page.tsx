"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { myDuels } from "@/lib/peerseus";
import { Empty, PageTitle, Spinner, timeAgo, useAsync } from "@/components/ui";

export default function Duels() {
  const { profile } = useAuth();
  const uid = profile!.id;
  const { data } = useAsync(() => myDuels(uid), [uid]);
  if (!data) return <Spinner />;
  return (
    <div>
      <PageTitle title="Duel" sub="Tantangan masuk dan riwayat duelmu." action={<Link href="/courses" className="btn-gold">+ Duel baru</Link>} />
      {data.length === 0 && <Empty>Belum ada duel. Buka materi yang punya kuis, lalu klik “Tantang teman”.</Empty>}
      <div className="space-y-2">
        {data.map((d) => {
          const meC = d.challengerId === uid;
          const opp = meC ? d.opponentName : d.challengerName;
          const myTurn = d.status === "pending" && !(meC ? d.challenger : d.opponent);
          const mine = meC ? d.challenger : d.opponent;
          const theirs = meC ? d.opponent : d.challenger;
          const label = myTurn ? "Giliranmu" : d.status === "pending" ? "Menunggu lawan" : d.winnerId === uid ? "Menang" : d.winnerId === null ? "Seri" : "Kalah";
          const color = myTurn ? "bg-gold text-ink" : d.status === "pending" ? "bg-paper text-muted" : d.winnerId === uid ? "bg-sea/10 text-sea" : d.winnerId === null ? "bg-paper" : "bg-red-50 text-red-700";
          return (
            <Link key={d.id} href={`/duel/${d.id}`} className="card flex items-center justify-between gap-3 !py-3 hover:border-ink">
              <div>
                <div className="font-semibold">vs {opp} <span className="text-xs font-normal text-muted">· {meC ? "kamu menantang" : "menantangmu"}</span></div>
                <div className="text-xs text-muted">{d.quizTitle} · {timeAgo(d.createdAt)}</div>
              </div>
              <div className="flex items-center gap-3">
                {mine && <span className="text-sm font-bold">{mine.score} – {theirs ? theirs.score : "?"}</span>}
                <span className={`badge ${color}`}>{label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
