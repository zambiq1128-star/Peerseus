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
        {data.weak.length ? <>Dipilih karena kuat di topik yang perlu kamu perkuat: <b className="text-ink">{data.weak.join(", ")}</b>.</> : "Selesaikan duel agar rekomendasi disesuaikan dengan topikmu. Sementara ini diurutkan dari level yang mirip."}
      </p>
      <div className="divide-y divide-line rounded-xl border border-line">
        {data.recs.map(({ member, profile: p, reasons }) => (
          <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <div className="font-medium">{member.name} <span className="text-xs font-normal text-muted">{member.major} · rating {member.elo}{member.isBot ? " · demo" : ""}</span></div>
              {reasons.length > 0 && <div className="text-xs text-good">{reasons.join(" · ")}</div>}
              {p?.contact && <div className="mt-1 text-xs text-muted">Kontak: <span className="text-ink">{p.contact}</span></div>}
            </div>
            <Link href={`/duel/new?course=${courseId}&opponent=${member.uid}`} className="btn-ghost !py-1.5">Ajak duel</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
