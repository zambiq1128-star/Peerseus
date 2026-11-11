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
      <PageTitle title="Duel" sub="Tantangan masuk dan riwayat duelmu." />
      {data.length === 0 && <Empty>Belum ada duel. Buka mata kuliah, lalu klik “Mulai duel”.</Empty>}
      <div className="divide-y divide-line rounded-xl border border-line empty:hidden">
        {data.map((d) => {
          const meC = d.challengerId === uid;
          const opp = meC ? d.opponentName : d.challengerName;
          const myTurn = d.status === "pending" && !(meC ? d.challenger : d.opponent);
          const mine = meC ? d.challenger : d.opponent;
          const theirs = meC ? d.opponent : d.challenger;
          const label = myTurn ? "Giliranmu" : d.status === "pending" ? "Menunggu lawan" : d.winnerId === uid ? "Menang" : d.winnerId === null ? "Seri" : "Kalah";
          const color = myTurn ? "!bg-accent !text-white" : d.status === "pending" ? "" : d.winnerId === uid ? "!bg-green-50 !text-good" : d.winnerId === null ? "" : "!bg-red-50 !text-bad";
          return (
            <Link key={d.id} href={`/duel/${d.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-paper">
              <div>
                <div className="font-medium">vs {opp} <span className="text-xs font-normal text-muted">· {meC ? "kamu menantang" : "menantangmu"}</span></div>
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
