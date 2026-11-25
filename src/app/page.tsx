"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isMyTurn, latestMaterials, MATERIAL_TYPES, materialType, myDuels } from "@/lib/peerseus";
import { proposalsToReview } from "@/lib/proposals";
import type { Course, Membership, QuestionProposal } from "@/lib/types";
import { Empty, ErrorState, Page, Section, Spinner, timeAgo, useAsync } from "@/components/ui";

export default function Home() {
  return (
    <>
      <Hero />
      <HomeBody />
    </>
  );
}

/** JRPG-menu hero: full-bleed navy block with a slanted bottom edge, oversized heading and parallelogram buttons. */
function Hero() {
  const { profile } = useAuth();
  const n = profile!.courseIds.length;
  return (
    <section aria-labelledby="hero-title" className="jrpg-diagonal relative -mx-4 -mt-6 mb-6 overflow-hidden bg-navy px-4 pb-24 pt-10 text-white sm:-mt-8 sm:pb-32 sm:pt-14">
      {/* Decorative: blue slab, cyan stripe, faint diagonal lines. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -right-24 top-0 h-full w-2/3 animate-slide-right bg-volt/25 [clip-path:polygon(28%_0,100%_0,100%_100%,0_100%)]" />
        <div className="absolute -right-10 top-0 h-full w-1/3 animate-slide-right bg-cyan/15 [animation-delay:90ms] [clip-path:polygon(40%_0,100%_0,100%_100%,0_100%)]" />
        <div className="absolute inset-0 opacity-[0.07] [background:repeating-linear-gradient(115deg,#fff_0_1px,transparent_1px_14px)]" />
      </div>
      <div className="relative mx-auto max-w-page">
        <p className="jrpg-tag animate-slide-left">Halo, {profile!.name.split(" ")[0]}</p>
        <h1 id="hero-title" className="jrpg-title mt-3 text-[clamp(3.25rem,14vw,8.5rem)]">
          <span className="block animate-slide-left [animation-delay:80ms]">Mata</span>
          <span className="block animate-slide-left text-cyan [animation-delay:160ms]">kuliahku</span>
        </h1>
        <p className="mt-5 max-w-md animate-slide-left text-base text-white/85 [animation-delay:240ms] sm:text-lg">
          Pilih mata kuliah untuk buka materi dan mulai duel.{n > 0 && ` ${n} mata kuliah siap dijelajahi.`}
        </p>
        <div className="mt-7 flex flex-wrap gap-4">
          <Link href="/courses" className="jrpg-btn-cyan animate-slide-left [animation-delay:320ms]">Atur mata kuliah</Link>
          <Link href="/explore" className="jrpg-btn-volt animate-slide-left [animation-delay:400ms]">Jelajah materi</Link>
        </div>
      </div>
    </section>
  );
}

function HomeBody() {
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
                <Link key={c.id} href={`/courses/${c.id}`} className="card flex items-center justify-between gap-3 hover:border-cyan">
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
