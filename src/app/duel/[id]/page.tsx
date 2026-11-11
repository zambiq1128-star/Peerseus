"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { missedTopics, SECONDS_PER_QUESTION, submitDuel } from "@/lib/peerseus";
import type { Duel } from "@/lib/types";
import { Empty, Spinner, useAsync } from "@/components/ui";
import PartnerList from "@/components/PartnerList";
import { MathText } from "@/components/Markdown";

export default function DuelPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const uid = profile!.id;
  const { data: duel, reload } = useAsync(() => db.get<Duel>("duels", id), [id]);

  if (duel === undefined) return <Spinner />;
  if (!duel) return <Empty>Duel tidak ditemukan.</Empty>;
  const role = duel.challengerId === uid ? "challenger" : duel.opponentId === uid ? "opponent" : null;
  if (!role) return <Empty>Kamu bukan peserta duel ini.</Empty>;
  if (!duel[role]) return <Play duel={duel} uid={uid} onDone={reload} />;
  return <Result duel={duel} uid={uid} />;
}

function Play({ duel, uid, onDone }: { duel: Duel; uid: string; onDone: () => void }) {
  const [started, setStarted] = useState(false);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [times, setTimes] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [left, setLeft] = useState(SECONDS_PER_QUESTION);
  const [submitting, setSubmitting] = useState(false);
  const t0 = useRef(0);
  const opp = duel.challengerId === uid ? duel.opponentName : duel.challengerName;
  const q = duel.questions[i];

  useEffect(() => {
    if (!started || picked !== null) return;
    t0.current = Date.now();
    setLeft(SECONDS_PER_QUESTION);
    const iv = setInterval(() => {
      const l = SECONDS_PER_QUESTION - Math.floor((Date.now() - t0.current) / 1000);
      setLeft(l);
      if (l <= 0) choose(-1);
    }, 250);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, i, picked]);

  function choose(k: number) {
    if (picked !== null) return;
    setPicked(k);
    const ms = Math.min(Date.now() - t0.current, SECONDS_PER_QUESTION * 1000);
    const a = [...answers, k], t = [...times, ms];
    setAnswers(a);
    setTimes(t);
    setTimeout(async () => {
      if (i + 1 < duel.questions.length) {
        setI(i + 1);
        setPicked(null);
      } else {
        setSubmitting(true);
        await submitDuel(duel.id, uid, a, t);
        onDone();
      }
    }, 1100);
  }

  if (!started) {
    return (
      <div className="mx-auto max-w-md">
        <div className="card space-y-4 text-center !p-8">
          <div className="text-sm text-muted">Duel melawan</div>
          <h1 className="text-2xl font-bold">{opp}</h1>
          <p className="text-sm text-muted">{duel.quizTitle} · {duel.questions.length} soal · {SECONDS_PER_QUESTION} detik per soal</p>
          <button className="btn-primary w-full !py-3" onClick={() => setStarted(true)}>Mulai</button>
        </div>
      </div>
    );
  }
  if (submitting) return <Spinner label="Menghitung hasil…" />;

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">Soal {i + 1} dari {duel.questions.length} <span className="text-muted">· {q.topic}</span></span>
        <span className={`font-semibold tabular-nums ${left <= 5 ? "text-bad" : ""}`}>{Math.max(left, 0)} detik</span>
      </div>
      <div className="mb-4 h-1 rounded-full bg-line">
        <div className="h-1 rounded-full bg-accent transition-all" style={{ width: `${(Math.max(left, 0) / SECONDS_PER_QUESTION) * 100}%` }} />
      </div>
      <div className="card !p-6">
        <h2 className="text-lg font-semibold leading-snug"><MathText text={q.question} /></h2>
        <div className="mt-5 grid gap-2">
          {q.options.map((o, k) => {
            const state = picked === null ? "hover:border-accent" : k === q.answerIndex ? "border-good bg-green-50" : k === picked ? "border-bad bg-red-50" : "opacity-50";
            return (
              <button key={k} disabled={picked !== null} onClick={() => choose(k)} className={`rounded-lg border border-line p-3 text-left text-sm transition ${state}`}>
                <span className="mr-2 font-semibold text-muted">{"ABCD"[k]}</span><MathText text={o} />
              </button>
            );
          })}
        </div>
        {picked === -1 && <p className="mt-3 text-sm text-bad">Waktu habis.</p>}
      </div>
    </div>
  );
}

function Result({ duel, uid }: { duel: Duel; uid: string }) {
  const meC = duel.challengerId === uid;
  const mine = meC ? duel.challenger! : duel.opponent!;
  const theirs = meC ? duel.opponent : duel.challenger;
  const oppName = meC ? duel.opponentName : duel.challengerName;
  const missed = missedTopics(duel, uid);
  const done = duel.status === "completed";
  const won = done && duel.winnerId === uid;
  const draw = done && duel.winnerId === null;
  const delta = done ? (meC ? duel.eloChange!.challenger : duel.eloChange!.opponent) : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="card text-center !p-8">
        <h1 className="text-2xl font-bold">{!done ? `Menunggu ${oppName}` : won ? "Kamu menang" : draw ? "Seri" : `${oppName} menang`}</h1>
        <div className="mt-4 flex items-center justify-center gap-8">
          <div><div className="text-xs text-muted">Kamu</div><div className="text-4xl font-bold">{mine.score}</div><div className="text-xs text-muted">{(mine.totalMs / 1000).toFixed(1)} detik</div></div>
          <div className="text-muted">vs</div>
          <div><div className="text-xs text-muted">{oppName}</div><div className="text-4xl font-bold">{theirs ? theirs.score : "?"}</div><div className="text-xs text-muted">{theirs ? `${(theirs.totalMs / 1000).toFixed(1)} detik` : "belum main"}</div></div>
        </div>
        {done && <div className={`mt-4 text-sm font-semibold ${delta >= 0 ? "text-good" : "text-bad"}`}>Rating {delta >= 0 ? "+" : ""}{delta}</div>}
        {!done && <p className="mt-3 text-sm text-muted">Hasil akhir muncul setelah {oppName} selesai menjawab.</p>}
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Topik yang perlu diperkuat</h2>
        {missed.length ? (
          <div className="flex flex-wrap gap-2">{missed.map((t) => <span key={t} className="badge !bg-red-50 !text-bad">{t}</span>)}</div>
        ) : (
          <p className="text-sm text-muted">Semua jawaban benar.</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Teman belajar untukmu</h2>
        <PartnerList courseId={duel.courseId} focusTopics={missed} limit={3} />
      </section>

      <details className="card">
        <summary className="cursor-pointer font-semibold">Pembahasan soal</summary>
        <ol className="mt-4 space-y-4">
          {duel.questions.map((q, i) => {
            const a = mine.answers[i];
            const ok = a === q.answerIndex;
            return (
              <li key={q.id} className="border-b border-line pb-3 text-sm last:border-0">
                <div className="font-medium"><span className={ok ? "text-good" : "text-bad"}>{ok ? "Benar" : "Salah"}</span> · <MathText text={q.question} /></div>
                <div className="mt-1">
                  Jawaban: <b><MathText text={q.options[q.answerIndex]} /></b>
                  {!ok && <span className="text-bad"> · kamu: {a === -1 ? "waktu habis" : <MathText text={q.options[a]} />}</span>}
                </div>
                <div className="text-xs text-muted"><MathText text={q.explanation} /></div>
              </li>
            );
          })}
        </ol>
      </details>

      <div className="flex gap-2">
        <Link href={`/duel/new?quiz=${duel.quizId}`} className="btn-primary">Duel lagi</Link>
        <Link href={`/courses/${duel.courseId}`} className="btn-ghost">Ke mata kuliah</Link>
      </div>
    </div>
  );
}
