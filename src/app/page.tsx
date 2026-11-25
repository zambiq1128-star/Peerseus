"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isMyTurn, latestMaterials, MATERIAL_TYPES, materialType, myDuels } from "@/lib/peerseus";
import { proposalsToReview } from "@/lib/proposals";
import type { Course, Membership, QuestionProposal } from "@/lib/types";
import { Empty, ErrorState, Page, PageHeader, Section, Spinner, timeAgo, useAsync } from "@/components/ui";

export default function Home() {
  const { profile } = useAuth();
  const uid = profile!.id;
  const { data, error, reload } = useAsync(async () => {
    const courses = (await db.list<Course>("courses")).sort((a, b) => a.code.localeCompare(b.code));
    const ms = await db.list<Membership>("memberships", [["uid", "==", uid]]);
    const duels = await myDuels(uid);
    const latest = await latestMaterials(profile!.courseIds);
    // Questions others proposed for my quizzes (empty until firestore.rules allow questionProposals).
    const toReview = await proposalsToReview(uid).catch(() => [] as QuestionProposal[]);
    return { courses, ms, duels, latest, toReview };
  }, [uid, profile?.courseIds.length]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  const myTurn = data.duels.filter((d) => isMyTurn(d, uid));
  const joined = data.courses.filter((c) => profile!.courseIds.includes(c.id));
  // Pending proposals grouped by material, in the order they arrived (newest first).
  const reviewByMaterial = [...new Map(data.toReview.map((p) => [p.materialId, { id: p.materialId, title: p.materialTitle, n: data.toReview.filter((x) => x.materialId === p.materialId).length }])).values()];

  return (
    <Page>
      {myTurn.length > 0 && (
        <div className="callout flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-medium">{myTurn.length} tantangan duel menunggu jawabanmu.</span>
          <Link href={`/duel/${myTurn[0].id}`} className="btn-primary">Jawab sekarang</Link>
        </div>
      )}

      {reviewByMaterial.length > 0 && (
        <Section title={`Usulan soal menunggu (${data.toReview.length})`}>
          <div className="rows">
            {reviewByMaterial.map((m) => (
              <Link key={m.id} href={`/materials/${m.id}`} className="row-link">
                <span className="text-sm font-medium">{m.title}</span>
                <span className="badge-accent shrink-0">{m.n} usulan</span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <PageHeader
        title="Mata kuliahku"
        sub="Pilih mata kuliah untuk buka materi dan mulai duel."
        action={<Link href="/courses" className="btn-ghost">Atur mata kuliah</Link>}
      />

      <Section>
        {joined.length === 0 ? (
          <Empty title="Belum ada mata kuliah" action={<Link href="/courses" className="btn-primary">Atur mata kuliah</Link>}>
            Pilih mata kuliah semester ini. Mata kuliah lain bisa kamu tambah kapan saja.
          </Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {joined.map((c) => {
              const m = data.ms.find((x) => x.courseId === c.id);
              return (
                <Link key={c.id} href={`/courses/${c.id}`} className="card flex items-center justify-between gap-3 hover:border-accent">
                  <div>
                    <div className="eyebrow">{c.code}</div>
                    <div className="font-semibold">{c.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted">Rating</div>
                    <div className="font-bold">{m?.elo ?? "-"}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        {joined.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            Mata kuliah mengulang, pilihan, atau lintas prodi bisa ditambah kapan saja lewat{" "}
            <Link href="/courses" className="link">Atur mata kuliah</Link>.
          </p>
        )}
      </Section>

      {data.latest.length > 0 && (
        <Section title="Materi terbaru di mata kuliahku">
          <div className="rows">
            {data.latest.map(({ material: m, quizReady }) => (
              <Link key={m.id} href={`/materials/${m.id}`} className="row-link">
                <div className="min-w-0">
                  <div className="font-medium">{m.title}</div>
                  <div className="text-xs text-muted">
                    {data.courses.find((c) => c.id === m.courseId)?.code ?? m.courseId} · {MATERIAL_TYPES[materialType(m)]} · oleh {m.uploaderName} · {timeAgo(m.createdAt)}
                  </div>
                </div>
                {quizReady && <span className="badge-accent shrink-0">Kuis siap duel</span>}
              </Link>
            ))}
          </div>
        </Section>
      )}

    </Page>
  );
}
