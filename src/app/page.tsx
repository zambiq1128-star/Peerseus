"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isMyTurn, latestMaterials, MATERIAL_TYPES, materialType, myDuels } from "@/lib/peerseus";
import { proposalsToReview } from "@/lib/proposals";
import type { Course, Membership, QuestionProposal } from "@/lib/types";
import { Ransom } from "@/components/Ransom";
import { Splat, Starburst } from "@/components/Decor";
import { Empty, ErrorState, Page, Section, Spinner, timeAgo, useAsync } from "@/components/ui";

export default function Home() {
  return (
    <>
      <Hero />
      <HomeBody />
    </>
  );
}

/**
 * Hero: black block with a slanted bottom edge, a big red slab with halftone dots, an original ink splat and
 * starburst, and a ransom-note heading. Everything decorative is aria-hidden; the heading reads as plain text.
 */
function Hero() {
  const { profile } = useAuth();
  const n = profile!.courseIds.length;
  return (
    <section aria-labelledby="hero-title" className="jrpg-diagonal relative -mx-4 -mt-6 mb-8 overflow-hidden bg-black px-4 pb-28 pt-10 text-white sm:-mt-8 sm:pb-36 sm:pt-14">
      {/* Decorative layers */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -right-24 top-0 h-full w-2/3 animate-slide-right bg-accent [clip-path:polygon(34%_0,100%_0,100%_100%,0_100%)]" />
        <div className="absolute -right-24 top-0 h-full w-2/3 opacity-40 [background:radial-gradient(#0a0a0a_1.6px,transparent_2px)_0_0/9px_9px] [clip-path:polygon(34%_0,100%_0,100%_100%,0_100%)]" />
        <div className="absolute right-[34%] top-0 hidden h-full w-3 bg-white sm:block [clip-path:polygon(70%_0,100%_0,30%_100%,0_100%)]" />
        <div className="absolute inset-0 opacity-[0.08] [background:repeating-linear-gradient(115deg,#fff_0_1px,transparent_1px_16px)]" />
        <Splat seed={7} className="absolute -right-10 bottom-4 h-56 w-56 animate-slam text-white [animation-delay:350ms] sm:right-16 sm:top-10 sm:h-80 sm:w-80" />
        <Splat seed={19} className="absolute -right-6 bottom-8 h-48 w-48 animate-slam text-black [animation-delay:450ms] sm:right-20 sm:top-14 sm:h-72 sm:w-72" />
        <Starburst seed={3} className="absolute right-4 top-6 h-24 w-24 animate-slam text-white [animation-delay:560ms] sm:right-[30%] sm:top-auto sm:bottom-24 sm:h-32 sm:w-32" />
        <Starburst seed={11} points={9} className="absolute bottom-16 left-[46%] hidden h-14 w-14 animate-slam text-accent [animation-delay:640ms] sm:block" />
      </div>
      <div className="relative mx-auto max-w-page">
        <p className="jrpg-tag animate-slide-left">Halo, {profile!.name.split(" ")[0]}</p>
        <h1 id="hero-title" className="mt-4 animate-slide-left text-[clamp(2.4rem,11.5vw,6.5rem)] [animation-delay:100ms]">
          <Ransom text={"Mata\nkuliahku"} />
        </h1>
        <p className="mt-6 max-w-md animate-slide-left text-base font-medium text-white [animation-delay:260ms] sm:text-lg">
          Pilih mata kuliah untuk buka materi dan mulai duel.{n > 0 && ` ${n} mata kuliah siap dijelajahi.`}
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/courses" className="jrpg-btn-volt animate-slide-left [animation-delay:340ms]">Atur mata kuliah</Link>
          <Link href="/explore" className="jrpg-btn-cyan animate-slide-left [animation-delay:420ms]">Jelajah materi</Link>
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
                <Link key={c.id} href={`/courses/${c.id}`} className="card card-tilt flex items-center justify-between gap-3">
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
