"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { academicLabel, entryYearLabel } from "@/lib/itb";
import { recommendPartners, weakTopicsOf, getMembership } from "@/lib/peerseus";
import type { Course } from "@/lib/types";
import { AccountBadge, Empty, ErrorState, Spinner, useAsync } from "./ui";

export default function PartnerList({ courseId, focusTopics, limit = 5 }: { courseId: string; focusTopics?: string[]; limit?: number }) {
  const { profile } = useAuth();
  const uid = profile!.id;
  const { data, error, reload } = useAsync(async () => {
    const me = await getMembership(courseId, uid);
    const weak = focusTopics?.length ? focusTopics : weakTopicsOf(me);
    const course = await db.get<Course>("courses", courseId);
    return { weak, courseCode: course?.code ?? courseId.toUpperCase(), recs: await recommendPartners(courseId, uid, weak, limit) };
  }, [courseId, uid, (focusTopics ?? []).join(",")]);

  if (error) return <ErrorState title="Gagal memuat teman belajar" message={error} onRetry={reload} />;
  if (!data) return <Spinner label="Mencari teman belajar…" />;
  if (!data.recs.length) return <Empty>Belum ada mahasiswa lain di mata kuliah ini.</Empty>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {data.weak.length && data.recs.some((r) => r.byTopic) ? <>Dipilih karena kuat di topik yang masih lemah di {data.courseCode}: <b className="text-ink">{data.weak.join(", ")}</b>.</> : "Selesaikan duel agar rekomendasi disesuaikan dengan topikmu. Sementara ini diurutkan dari level yang mirip."}
      </p>
      <div className="rows">
        {data.recs.map(({ member, profile: p, reasons }) => (
          <div key={member.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <Link href={`/users/${member.uid}`} className="min-w-0 break-words font-medium hover:underline">{member.name}</Link>
                <AccountBadge itb={p?.isItbVerified} className="mt-0.5 shrink-0 whitespace-nowrap" />
              </div>
              <div className="text-xs text-muted">
                {[...academicLabel(p, member.major).split(" · "), entryYearLabel(p), `rating ${member.elo}${member.isBot ? " · demo" : ""}`].filter(Boolean).map((part, i) => (
                  <span key={i}>{i > 0 && " · "}<span className="whitespace-nowrap">{part}</span></span>
                ))}
              </div>
              {reasons.length > 0 && <div className="text-xs text-good">{reasons.join(" · ")}</div>}
              {p?.contact && <div className="mt-1 text-xs text-muted">Kontak: <span className="text-ink">{p.contact}</span></div>}
            </div>
            <Link href={`/duel/new?course=${courseId}&opponent=${member.uid}`} className="btn-ghost shrink-0 self-start !py-1.5 sm:self-center">Ajak duel</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
