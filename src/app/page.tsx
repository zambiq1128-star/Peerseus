"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isMyTurn, latestMaterials, MATERIAL_TYPES, materialType, myDuels } from "@/lib/peerseus";
import { proposalsToReview } from "@/lib/proposals";
import type { Course, Membership, QuestionProposal } from "@/lib/types";
import { DoodleField } from "@/components/Doodles";
import { Empty, ErrorState, Page, Section, Spinner, timeAgo, useAsync } from "@/components/ui";

export default function Home() {
  return (
    <>
      <Hero />
      <HomeBody />
    </>
  );
}

/** Pastel hero: soft paper blobs, small doodles that drift and blink, a big handwritten heading. */
function Hero() {
  const { profile } = useAuth();
  const n = profile!.courseIds.length;
  return (
    <section aria-labelledby="hero-title" className="relative -mx-4 -mt-6 mb-6 overflow-hidden px-4 pb-14 pt-10 sm:-mt-8 sm:pb-20 sm:pt-14">
      {/* Decorative: wobbly pastel blobs and doodles. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,#000_72%,transparent)]">
        <div className="absolute -right-16 -top-10 h-72 w-72 rotate-12 bg-lavender/45 [border-radius:58%_42%_55%_45%/48%_56%_44%_52%]" />
        <div className="absolute -bottom-16 left-[8%] h-56 w-72 -rotate-6 bg-mint/45 [border-radius:45%_55%_40%_60%/55%_45%_58%_42%]" />
        <div className="absolute right-[26%] top-[46%] h-32 w-44 rotate-3 bg-butter/60 [border-radius:55%_45%_52%_48%/45%_55%_45%_55%]" />
      </div>
      <DoodleField spots={[
        { kind: "star", fill: "butter", x: "6%", y: "14%", size: 38, rot: -10, float: true },
        { kind: "cloud", fill: "sky", x: "70%", y: "10%", size: 70, rot: 3, float: true, delay: 1 },
        { kind: "heart", fill: "pink", x: "88%", y: "52%", size: 40, rot: 12, delay: 0.6 },
        { kind: "spiral", fill: "none", x: "52%", y: "76%", size: 42, rot: -8, delay: 2.2, hideOnPhone: true },
        { kind: "scribble", x: "4%", y: "72%", size: 64, rot: -4, delay: 1.4, hideOnPhone: true },
        { kind: "sparkle", fill: "lavender", x: "80%", y: "82%", size: 28, float: true, delay: 3 },
        { kind: "star", fill: "pink", x: "93%", y: "20%", size: 22, rot: 14, delay: 2.6 },
      ]} />
      <div className="relative mx-auto max-w-page">
        <p className="badge-strong animate-slide-left !px-4 !text-base">Halo, {profile!.name.split(" ")[0]}</p>
        <h1 id="hero-title" className="mt-3 text-[clamp(3.5rem,15vw,8rem)] leading-[0.95]">
          <span className="block animate-slide-left [animation-delay:80ms]">Mata</span>
          <span className="block animate-slide-left text-plum [animation-delay:160ms]">kuliahku</span>
        </h1>
        <p className="mt-5 max-w-md animate-slide-left text-base text-ink-soft [animation-delay:240ms] sm:text-lg">
          Pilih mata kuliah untuk buka materi dan mulai duel.{n > 0 && ` ${n} mata kuliah siap dijelajahi.`}
        </p>
        <div className="mt-7 flex flex-wrap gap-4">
          <Link href="/courses" className="btn-primary animate-slide-left [animation-delay:320ms]">Atur mata kuliah</Link>
          <Link href="/explore" className="btn-lavender animate-slide-left [animation-delay:400ms]">Jelajah materi</Link>
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
