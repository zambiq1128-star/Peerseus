"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { latestMaterials, MATERIAL_TYPES, materialType } from "@/lib/peerseus";
import { daysLeft, deadlineLabel, isUrgent, nearestOpportunities, OPP_TYPES } from "@/lib/opportunities";
import { discussionNotices, markSeen, type DiscussionNotice } from "@/lib/discussions";
import { proposalsToReview } from "@/lib/proposals";
import type { Course, Membership, Opportunity, QuestionProposal } from "@/lib/types";
import { Ransom } from "@/components/Ransom";
import { Splat, Starburst } from "@/components/Decor";
import { Empty, ErrorState, Page, Section, Spinner, timeAgo, useAsync } from "@/components/ui";
import { InviteActions, InviteText, useIncomingInvites } from "@/components/DuelInvites";

export default function Home() {
  return (
    <>
      <Hero />
      <HomeBody />
    </>
  );
}

/**
 * Hero: black block with a slanted bottom edge, a big blue slab with halftone dots, an original ink splat and
 * starburst, and a ransom-note heading. Everything decorative is aria-hidden; the heading reads as plain text.
 */
function Hero() {
  const { profile } = useAuth();
  const n = profile!.courseIds.length;
  return (
    <section aria-labelledby="hero-title" className="hero-slab jrpg-diagonal relative -mx-4 -mt-6 mb-8 overflow-hidden bg-black px-4 pb-28 pt-10 text-white sm:-mt-8 sm:pb-36 sm:pt-14">
      {/* Decorative layers */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -right-24 top-0 h-full w-2/3 animate-slide-right bg-accent [clip-path:polygon(34%_0,100%_0,100%_100%,0_100%)]" />
        <div className="absolute -right-24 top-0 h-full w-2/3 opacity-40 [background:radial-gradient(#0a0a0a_1.6px,transparent_2px)_0_0/9px_9px] [clip-path:polygon(34%_0,100%_0,100%_100%,0_100%)]" />
        <div className="absolute right-[34%] top-0 hidden h-full w-3 bg-white sm:block [clip-path:polygon(70%_0,100%_0,30%_100%,0_100%)]" />
        <div className="absolute inset-0 opacity-[0.08] [background:repeating-linear-gradient(115deg,#fff_0_1px,transparent_1px_16px)]" />
        <Splat seed={7} className="absolute -right-8 bottom-2 h-28 w-28 animate-slam text-white [animation-delay:350ms] sm:bottom-auto sm:right-16 sm:top-10 sm:h-80 sm:w-80" />
        <Splat seed={19} className="absolute -right-6 bottom-4 h-24 w-24 animate-slam text-black [animation-delay:450ms] sm:bottom-auto sm:right-20 sm:top-14 sm:h-72 sm:w-72" />
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

/** Duel invites waiting for my answer (live); the banner shows the same on every other page. */
function IncomingInvites({ uid }: { uid: string }) {
  const { invites, now } = useIncomingInvites(uid);
  if (!invites.length) return null;
  return (
    <div className="callout space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <InviteText duel={invites[0]} now={now} />
        <InviteActions key={invites[0].id} duel={invites[0]} uid={uid} />
      </div>
      {invites.length > 1 && <Link href="/duels" className="link text-xs">+{invites.length - 1} ajakan lain</Link>}
    </div>
  );
}

function HomeBody() {
  const { profile } = useAuth();
  const uid = profile!.id;
  const { data, error, reload } = useAsync(async () => {
    const courses = (await db.list<Course>("courses")).sort((a, b) => a.code.localeCompare(b.code));
    const ms = await db.list<Membership>("memberships", [["uid", "==", uid]]);
    const latest = await latestMaterials(profile!.courseIds);
    // Questions others proposed for my quizzes (empty until firestore.rules allow questionProposals).
    const toReview = await proposalsToReview(uid).catch(() => [] as QuestionProposal[]);
    // Diskusi markers; a failed load must not break the home page.
    const notices = await discussionNotices(uid).catch(() => ({ toAnswer: [], oppToAnswer: [], answered: [] }));
    // Peluang mendekati deadline; a failed load must not break the home page either.
    const opps = await nearestOpportunities(profile!.major, 3).catch(() => [] as Opportunity[]);
    return { courses, ms, latest, toReview, notices, opps };
  }, [uid, profile?.courseIds.length]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  const joined = data.courses.filter((c) => profile!.courseIds.includes(c.id));
  // Pending proposals grouped by material, in the order they arrived (newest first).
  const reviewByMaterial = [...new Map(data.toReview.map((p) => [p.materialId, { id: p.materialId, title: p.materialTitle, n: data.toReview.filter((x) => x.materialId === p.materialId).length }])).values()];

  return (
    <Page>
      <IncomingInvites uid={uid} />

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

      <DiscussionNotices uid={uid} title="Pertanyaan baru di materimu" label="belum dijawab" items={data.notices.toAnswer} />
      <DiscussionNotices uid={uid} title="Pertanyaan baru di peluang yang kamu bagikan" label="belum dijawab" items={data.notices.oppToAnswer} />
      <DiscussionNotices uid={uid} title="Pertanyaanmu dijawab" label="dijawab" items={data.notices.answered} />

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

      {data.opps.length > 0 && (
        <Section title="Peluang mendekati deadline" action={<Link href="/opportunities" className="link text-sm">Lihat semua peluang</Link>}>
          <div className="rows">
            {data.opps.map((o) => {
              const d = daysLeft(o.deadline);
              return (
                <Link key={o.id} href={`/opportunities/${o.id}`} className="row-link">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{o.title}</div>
                    <div className="text-xs text-muted">{OPP_TYPES[o.type] ?? OPP_TYPES.lainnya} · {o.organizer}</div>
                  </div>
                  <span className={`${isUrgent(d) ? "badge-strong" : "badge"} shrink-0`}>{deadlineLabel(d)}</span>
                </Link>
              );
            })}
          </div>
        </Section>
      )}

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

/** Home marker for Diskusi, same look as "Usulan soal menunggu". Opening a row marks it as seen (this browser only). */
function DiscussionNotices({ uid, title, label, items }: { uid: string; title: string; label: string; items: DiscussionNotice[] }) {
  const [gone, setGone] = useState<string[]>([]);
  const list = items.filter((n) => !gone.includes(n.parentId));
  if (!list.length) return null;
  return (
    <Section title={`${title} (${list.reduce((s, n) => s + n.count, 0)})`}>
      <div className="rows">
        {list.map((n) => (
          <Link key={n.parentId} href={n.href} className="row-link"
            onClick={() => { markSeen(uid, n.keys); setGone([...gone, n.parentId]); }}>
            <span className="text-sm font-medium">{n.title}</span>
            <span className="badge-accent shrink-0">{n.count} {n.replied ? "dibalas" : label}</span>
          </Link>
        ))}
      </div>
    </Section>
  );
}
