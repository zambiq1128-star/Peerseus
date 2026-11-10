"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { recommendPartners, weakTopicsOf, getMembership } from "@/lib/peerseus";
import { Empty, Spinner, useAsync } from "./ui";

export default function PartnerList({ courseId, focusTopics, limit = 5 }: { courseId: string; focusTopics?: string[]; limit?: number }) {
  const { profile } = useAuth();
  const uid = profile!.id;
  const { data } = useAsync(async () => {
    const me = await getMembership(courseId, uid);
    const weak = focusTopics?.length ? focusTopics : weakTopicsOf(me);
    return { weak, recs: await recommendPartners(courseId, uid, weak, limit) };
  }, [courseId, uid, (focusTopics ?? []).join(",")]);

  if (!data) return <Spinner label="Mencari teman belajar…" />;
  if (!data.recs.length) return <Empty>Belum ada mahasiswa lain di mata kuliah ini.</Empty>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {data.weak.length ? <>Dicocokkan untuk topik yang perlu kamu perkuat: <b className="text-ink">{data.weak.join(", ")}</b>.</> : "Selesaikan duel agar rekomendasi disesuaikan dengan topik yang kamu lewatkan. Sementara ini diurutkan berdasarkan level yang mirip."}
      </p>
      {data.recs.map(({ member, profile: p, score, reasons }) => (
        <div key={member.id} className="card flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-ink font-bold text-gold">{member.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
            <div>
              <div className="font-bold">{member.name} {member.isBot && <span className="badge bg-paper text-muted">demo</span>}</div>
              <div className="text-xs text-muted">{member.major} · Elo {member.elo}{p?.bio ? ` · ${p.bio}` : ""}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {reasons.map((r) => <span key={r} className="badge bg-sea/10 text-sea">{r}</span>)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">cocok {Math.round(score * 100)}%</span>
            {p?.contact && <span className="badge bg-gold-soft">{p.contact}</span>}
            <Link href={`/duel/new?course=${courseId}&opponent=${member.uid}`} className="btn-ghost !py-1.5">Ajak duel</Link>
          </div>
        </div>
      ))}
    </div>
  );
}
