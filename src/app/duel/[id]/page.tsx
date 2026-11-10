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
      <div className="mx-auto max-w-lg text-center">
        <div className="card space-y-4 !p-8">
          <div className="text-5xl">⚔️</div>
          <h1 className="text-2xl font-extrabold">Duel vs {opp}</h1>
          <p className="text-sm text-muted">{duel.quizTitle}<br />{duel.questions.length} soal · {SECONDS_PER_QUESTION} detik per soal. Skor sama? Yang lebih cepat menang.</p>
          <button className="btn-gold w-full !py-3 text-base" onClick={() => setStarted(true)}>Mulai!</button>
        </div>
      </div>
    );
  }
  if (submitting) return <Spinner label="Menghitung hasil duel…" />;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="font-semibold">Soal {i + 1}/{duel.questions.length} · <span className="text-muted">{q.topic}</span></span>
        <span className={`badge text-sm ${left <= 5 ? "bg-red-100 text-red-700" : "bg-ink text-white"}`}>⏱ {Math.max(left, 0)} d</span>
      </div>
      <div className="mb-4 h-1.5 rounded-full bg-line">
        <div className="h-1.5 rounded-full bg-gold transition-all" style={{ width: `${(Math.max(left, 0) / SECONDS_PER_QUESTION) * 100}%` }} />
      </div>
      <div className="card !p-6">
        <h2 className="text-lg font-bold leading-snug">{q.question}</h2>
        <div className="mt-5 grid gap-2">
          {q.options.map((o, k) => {
            const state = picked === null ? "" : k === q.answerIndex ? "border-sea bg-sea/10" : k === picked ? "border-red-400 bg-red-50" : "opacity-60";
            return (
              <button key={k} disabled={picked !== null} onClick={() => choose(k)} className={`rounded-xl border border-line p-3 text-left text-sm font-medium transition hover:border-ink ${state}`}>
                <span className="mr-2 font-bold text-muted">{"ABCD"[k]}.</span>{o}
              </button>
            );
          })}
        </div>
        {picked === -1 && <p className="mt-3 text-sm text-red-600">Waktu habis!</p>}
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
    <div className="mx-auto max-w-3xl space-y-6">
      <div className={`card text-center !p-8 ${done ? (won ? "border-sea" : draw ? "" : "border-red-300") : ""}`}>
        <div className="text-5xl">{!done ? "⏳" : won ? "🏆" : draw ? "🤝" : "💪"}</div>
        <h1 className="mt-2 text-2xl font-extrabold">{!done ? `Menunggu ${oppName}` : won ? "Kamu menang!" : draw ? "Seri!" : `${oppName} menang`}</h1>
        <div className="mt-4 flex items-center justify-center gap-6 text-center">
          <div><div className="text-xs text-muted">Kamu</div><div className="text-4xl font-extrabold">{mine.score}</div><div className="text-xs text-muted">{(mine.totalMs / 1000).toFixed(1)} d</div></div>
          <div className="text-muted">vs</div>
          <div><div className="text-xs text-muted">{oppName}</div><div className="text-4xl font-extrabold">{theirs ? theirs.score : "?"}</div><div className="text-xs text-muted">{theirs ? `${(theirs.totalMs / 1000).toFixed(1)} d` : "belum main"}</div></div>
        </div>
        {done && <div className={`mt-4 inline-block badge text-sm ${delta >= 0 ? "bg-sea/10 text-sea" : "bg-red-100 text-red-700"}`}>Elo {delta >= 0 ? "+" : ""}{delta}</div>}
        {!done && <p className="mt-3 text-sm text-muted">Hasil akhir dan perubahan Elo muncul setelah {oppName} menyelesaikan duel.</p>}
      </div>

      <section className="card">
        <h2 className="font-bold">Topik yang perlu diperkuat</h2>
        {missed.length ? (
          <div className="mt-2 flex flex-wrap gap-2">{missed.map((t) => <span key={t} className="badge bg-red-50 text-red-700">{t}</span>)}</div>
        ) : (
          <p className="mt-1 text-sm text-muted">Semua benar. Mantap! 🎉</p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">🤝 Teman belajar yang direkomendasikan</h2>
        <PartnerList courseId={duel.courseId} focusTopics={missed} limit={3} />
      </section>

      <section className="card">
        <h2 className="mb-3 font-bold">Pembahasan</h2>
        <ol className="space-y-4">
          {duel.questions.map((q, i) => {
            const a = mine.answers[i];
            const ok = a === q.answerIndex;
            return (
              <li key={q.id} className="border-b border-line pb-3 last:border-0">
                <div className="flex gap-2 text-sm"><span>{ok ? "✅" : "❌"}</span><b>{q.question}</b></div>
                <div className="ml-6 mt-1 text-sm">
                  Jawaban benar: <b>{q.options[q.answerIndex]}</b>
                  {!ok && <span className="text-red-600"> · kamu: {a === -1 ? "waktu habis" : q.options[a]}</span>}
                  {theirs && <span className="text-muted"> · {oppName}: {theirs.answers[i] === q.answerIndex ? "benar" : "salah"}</span>}
                </div>
                <div className="ml-6 text-xs text-muted">{q.explanation}</div>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="flex gap-2">
        <Link href={`/duel/new?quiz=${duel.quizId}`} className="btn-gold">Duel lagi</Link>
        <Link href={`/courses/${duel.courseId}`} className="btn-ghost">Ke mata kuliah</Link>
      </div>
    </div>
  );
}
