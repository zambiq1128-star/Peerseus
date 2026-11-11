"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createDuel, DUEL_QUESTIONS, getMembership, joinCourse, SECONDS_PER_QUESTION, suggestOpponents } from "@/lib/peerseus";
import type { Course, Quiz } from "@/lib/types";
import { Empty, Spinner, useAsync } from "@/components/ui";

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
  const [quizId, setQuizId] = useState("");
  const [oppId, setOppId] = useState("");
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
  if (!data || !data.course) return <Empty>Pilih materi yang sudah punya kuis untuk mulai duel.</Empty>;
  if (!data.quizzes.length) return <Empty>Belum ada kuis di mata kuliah ini. <Link className="text-accent" href={`/courses/${data.course.id}`}>Upload materi</Link> dulu.</Empty>;
  if (!data.opponents.length) return <Empty>Belum ada lawan di mata kuliah ini.</Empty>;

  // Sensible defaults so the user can start with one click.
  const quiz = data.quizzes.find((q) => q.id === (quizId || quizParam)) ?? data.quizzes[0];
  const opp = data.opponents.find((o) => o.uid === (oppId || opponentParam)) ?? data.opponents[0];
  const myElo = data.me?.elo ?? 1000;

  async function start() {
    setBusy(true);
    if (!data!.me) { await joinCourse(profile!, data!.course!.id); await refresh(); }
    const d = await createDuel(quiz, profile!, opp);
    router.push(`/duel/${d.id}`);
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">Duel kuis</h1>
        <p className="text-sm text-muted">{data.course.code} · {DUEL_QUESTIONS} soal · {SECONDS_PER_QUESTION} detik per soal. Skor sama, yang lebih cepat menang.</p>
      </div>

      {data.quizzes.length > 1 && (
        <div>
          <label className="label" htmlFor="qz">Kuis</label>
          <select id="qz" className="input" value={quiz.id} onChange={(e) => setQuizId(e.target.value)}>
            {data.quizzes.map((q) => <option key={q.id} value={q.id}>{q.title} ({q.questions.length} soal)</option>)}
          </select>
        </div>
      )}
      {data.quizzes.length === 1 && <p className="text-sm">Kuis: <b>{quiz.title}</b></p>}

      <div>
        <div className="label">Lawan <span className="font-normal text-muted">(urut dari rating terdekat denganmu, {myElo})</span></div>
        <div className="divide-y divide-line rounded-xl border border-line">
          {data.opponents.map((o) => (
            <label key={o.uid} className={`flex cursor-pointer items-center justify-between gap-3 p-3 ${opp.uid === o.uid ? "bg-accent-soft" : "hover:bg-paper"}`}>
              <span className="flex items-center gap-2 text-sm">
                <input type="radio" checked={opp.uid === o.uid} onChange={() => setOppId(o.uid)} />
                <span className="font-medium">{o.name}</span>
                <span className="text-xs text-muted">{o.major}{o.isBot ? " · demo" : ""}</span>
              </span>
              <span className="text-sm font-semibold">{o.elo}</span>
            </label>
          ))}
        </div>
      </div>

      <button className="btn-primary w-full !py-3" disabled={busy} onClick={start}>{busy ? "Menyiapkan…" : `Mulai duel vs ${opp.name.split(" ")[0]}`}</button>
      {!opp.isBot && <p className="text-center text-xs text-muted">Kamu jawab duluan. {opp.name} menjawab soal yang sama nanti, lalu hasilnya dibandingkan.</p>}
    </div>
  );
}
