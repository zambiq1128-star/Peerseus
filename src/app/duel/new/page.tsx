"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createDuel, DUEL_QUESTIONS, getMembership, joinCourse, SECONDS_PER_QUESTION, suggestOpponents } from "@/lib/peerseus";
import type { Course, Membership, Quiz } from "@/lib/types";
import { Empty, PageTitle, Spinner, useAsync } from "@/components/ui";

export default function Page() {
  return <Suspense fallback={<Spinner />}><NewDuel /></Suspense>;
}

function NewDuel() {
  const sp = useSearchParams();
  const router = useRouter();
  const { profile, refresh } = useAuth();
  const uid = profile!.id;
  const quizParam = sp.get("quiz");
  const courseParam = sp.get("course");
  const opponentParam = sp.get("opponent");
  const [quizId, setQuizId] = useState(quizParam ?? "");
  const [oppId, setOppId] = useState(opponentParam ?? "");
  const [busy, setBusy] = useState(false);

  const { data } = useAsync(async () => {
    let courseId = courseParam;
    if (quizParam) courseId = (await db.get<Quiz>("quizzes", quizParam))?.courseId ?? null;
    if (!courseId) return null;
    const course = await db.get<Course>("courses", courseId);
    const quizzes = (await db.list<Quiz>("quizzes", [["courseId", "==", courseId]])).filter((q) => q.status === "published");
    const me = await getMembership(courseId, uid);
    const opponents = await suggestOpponents(courseId, uid);
    return { course, quizzes, opponents, me };
  }, [quizParam, courseParam, uid]);

  if (data === undefined) return <Spinner />;
  if (!data || !data.course) return <Empty>Pilih kuis dari halaman materi untuk mulai duel.</Empty>;
  const quiz = data.quizzes.find((q) => q.id === quizId);
  const opp = data.opponents.find((o) => o.uid === oppId);

  async function start() {
    if (!quiz || !opp) return;
    setBusy(true);
    if (!data!.me) { await joinCourse(profile!, data!.course!.id); await refresh(); }
    const d = await createDuel(quiz, profile!, opp);
    router.push(`/duel/${d.id}`);
  }

  const myElo = data.me?.elo ?? 1000;
  const fit = (o: Membership) => {
    const d = Math.abs(o.elo - myElo);
    return d <= 60 ? "Sangat seimbang" : d <= 150 ? "Seimbang" : o.elo > myElo ? "Lebih kuat" : "Lebih mudah";
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="Mulai duel" sub={`${data.course.code} · ${DUEL_QUESTIONS} soal acak · ${SECONDS_PER_QUESTION} detik per soal`} />
      <section className="card mb-4">
        <h2 className="mb-3 font-bold">1. Pilih kuis</h2>
        {data.quizzes.length === 0 ? <Empty>Belum ada kuis yang dipublikasikan di mata kuliah ini.</Empty> : (
          <div className="grid gap-2">
            {data.quizzes.map((q) => (
              <label key={q.id} className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 ${quizId === q.id ? "border-ink bg-paper" : "border-line"}`}>
                <span className="flex items-center gap-2"><input type="radio" checked={quizId === q.id} onChange={() => setQuizId(q.id)} /> <b>{q.title}</b></span>
                <span className="text-xs text-muted">{q.questions.length} soal</span>
              </label>
            ))}
          </div>
        )}
      </section>
      <section className="card mb-4">
        <h2 className="font-bold">2. Pilih lawan</h2>
        <p className="mb-3 text-xs text-muted">Diurutkan dari Elo yang paling dekat dengan kamu ({myElo}), supaya duelnya seimbang.</p>
        <div className="grid gap-2">
          {data.opponents.map((o) => (
            <label key={o.uid} className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 ${oppId === o.uid ? "border-ink bg-paper" : "border-line"}`}>
              <span className="flex items-center gap-2">
                <input type="radio" checked={oppId === o.uid} onChange={() => setOppId(o.uid)} />
                <b>{o.name}</b>{o.isBot && <span className="badge bg-paper text-muted">demo</span>}
                <span className="text-xs text-muted">{o.major}</span>
              </span>
              <span className="text-right text-xs"><b>{o.elo}</b> <span className="text-muted">· {fit(o)}</span></span>
            </label>
          ))}
        </div>
      </section>
      <button className="btn-gold w-full !py-3 text-base" disabled={!quiz || !opp || busy} onClick={start}>{busy ? "Menyiapkan…" : "⚔️ Mulai duel"}</button>
      {opp && !opp.isBot && <p className="mt-2 text-center text-xs text-muted">Kamu main duluan. {opp.name} akan menjawab soal yang sama dan hasilnya dibandingkan.</p>}
    </div>
  );
}
