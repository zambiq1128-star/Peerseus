"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canDecline, missedTopics, SECONDS_PER_QUESTION, submitDuel } from "@/lib/peerseus";
import type { Duel } from "@/lib/types";
import { ErrorState, NotFound, Page, Section, Spinner, useAsync, useCountUp } from "@/components/ui";
import DeclineDuel from "@/components/DeclineDuel";
import PartnerList from "@/components/PartnerList";
import { MathText } from "@/components/Markdown";

export default function DuelPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const uid = profile!.id;
  const { data: duel, error, reload } = useAsync(() => db.get<Duel>("duels", id), [id]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (duel === undefined) return <Spinner />;
  if (!duel) return <NotFound title="Duel tidak ditemukan" back={{ href: "/duels", label: "Ke daftar duel" }} />;
  const role = duel.challengerId === uid ? "challenger" : duel.opponentId === uid ? "opponent" : null;
  if (!role) return <NotFound title="Kamu bukan peserta duel ini" back={{ href: "/duels", label: "Ke daftar duel" }} />;
  if (!duel[role]) return duel.status === "declined" ? <Declined duel={duel} uid={uid} /> : <Play duel={duel} uid={uid} onDone={reload} />;
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
        // A failed submit (e.g. the opponent declined meanwhile) reloads the duel to show its current state.
        await submitDuel(duel.id, uid, a, t).catch(() => {});
        onDone();
      }
    }, 1100);
  }

  if (!started) {
    return (
      <Page width="narrow">
        <div className="card space-y-5 text-center !p-8">
          <div className="eyebrow">{duel.challengerId === uid ? "Kamu menantang" : "Kamu ditantang"}</div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <span className="animate-slide-left font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">Kamu</span>
            <span className="animate-slam font-display text-6xl font-bold italic text-cyan [animation-delay:200ms] sm:text-7xl">VS</span>
            <h1 className="animate-slide-right min-w-0 break-words font-display text-4xl font-bold uppercase tracking-tight text-ink sm:text-5xl">{opp}</h1>
          </div>
          <p className="text-sm text-muted">{duel.quizTitle} · {duel.questions.length} soal · {SECONDS_PER_QUESTION} detik per soal</p>
          <button className="btn-primary w-full !py-3 !text-lg" onClick={() => setStarted(true)}>Mulai duel</button>
          {canDecline(duel, uid) && (
            <div className="border-t border-line pt-4">
              <p className="mb-2 text-xs text-muted">Tidak ingin menjawab? Menolak tidak mengubah rating siapa pun.</p>
              <DeclineDuel duelId={duel.id} uid={uid} onDone={onDone} className="justify-center" />
            </div>
          )}
        </div>
      </Page>
    );
  }
  if (submitting) return <Spinner label="Menghitung hasil…" />;

  return (
    <Page width="narrow">
      <div>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">Soal {i + 1} dari {duel.questions.length} <span className="text-muted">· {q.topic}</span></span>
          <span className={`font-display text-3xl font-bold tabular-nums ${left <= 5 ? "inline-block animate-tick text-bad" : "text-cyan"}`}>{Math.max(left, 0)}<span className="ml-1 text-sm font-medium uppercase tracking-wider text-muted">detik</span></span>
        </div>
        <div className="mb-4 h-1.5 bg-line">
          <div className={`h-1.5 transition-all ${left <= 5 ? "bg-bad" : "bg-cyan"}`} style={{ width: `${(Math.max(left, 0) / SECONDS_PER_QUESTION) * 100}%` }} />
        </div>
        <div key={i} className="card animate-page-in !p-6">
          <h2 className="text-lg font-semibold leading-snug"><MathText text={q.question} /></h2>
          <div className="mt-5 grid gap-2">
            {q.options.map((o, k) => {
              const state = picked === null ? "hover:border-cyan" : k === q.answerIndex ? "animate-pop border-good bg-good-soft font-semibold text-good" : k === picked ? "animate-shake border-bad bg-bad-soft font-semibold text-bad" : "opacity-50";
              return (
                <button key={k} disabled={picked !== null} onClick={() => choose(k)} className={`rounded-control border border-line p-3 text-left text-sm transition ${state}`}>
                  <span className="mr-2 font-semibold text-muted">{"ABCD"[k]}</span><MathText text={o} />
                </button>
              );
            })}
          </div>
          {picked === -1 && <p className="mt-3 text-sm text-bad">Waktu habis.</p>}
        </div>
      </div>
    </Page>
  );
}

/** A declined duel seen by someone who never played it. */
function Declined({ duel, uid }: { duel: Duel; uid: string }) {
  const meC = duel.challengerId === uid;
  return (
    <Page width="narrow">
      <div className="card space-y-3 text-center !p-8">
        <span className="badge">Ditolak</span>
        <h1 className="text-3xl font-bold">{meC ? `${duel.opponentName} menolak duel ini` : `Kamu menolak tantangan ${duel.challengerName}`}</h1>
        <p className="text-sm text-muted">{duel.quizTitle} · rating tidak berubah.</p>
        <div className="flex justify-center gap-2 pt-2">
          {meC && <Link href={`/duel/new?quiz=${duel.quizId}`} className="btn-primary">Cari lawan lain</Link>}
          <Link href="/duels" className="btn-ghost">Ke daftar duel</Link>
        </div>
      </div>
    </Page>
  );
}

function Result({ duel, uid }: { duel: Duel; uid: string }) {
  const meC = duel.challengerId === uid;
  const mine = meC ? duel.challenger! : duel.opponent!;
  const theirs = meC ? duel.opponent : duel.challenger;
  const oppName = meC ? duel.opponentName : duel.challengerName;
  const missed = missedTopics(duel, uid);
  const done = duel.status === "completed";
  const declined = duel.status === "declined";
  const won = done && duel.winnerId === uid;
  const draw = done && duel.winnerId === null;
  const delta = done ? (meC ? duel.eloChange!.challenger : duel.eloChange!.opponent) : 0;

  const tone = !done ? "text-ink-soft" : won ? "text-cyan" : draw ? "text-ink" : "text-bad";
  const edge = !done ? "[--card-border:var(--color-line)]" : won ? "[--card-border:var(--color-cyan)]" : draw ? "[--card-border:var(--color-line)]" : "[--card-border:var(--color-bad)]";
  const myScore = useCountUp(mine.score, 700, 300);
  const theirScore = useCountUp(theirs ? theirs.score : 0, 700, 450);
  const shownDelta = useCountUp(delta, 1400, 800);
  const verdict = declined ? "Ditolak" : !done ? "Menunggu" : won ? "Menang" : draw ? "Seri" : "Kalah";

  return (
    <Page width="narrow">
      <div className={`card [overflow:clip] [overflow-clip-margin:12px] text-center !p-8 ${edge}`}>
        <div className="eyebrow">{declined ? `${oppName} menolak duel ini` : !done ? `Menunggu ${oppName}` : `Duel melawan ${oppName}`}</div>
        <h1 className={`mt-1 animate-slam text-7xl sm:text-8xl ${tone} ${done && won ? "animate-glow" : ""}`}>{verdict}</h1>
        <div className="mt-6 flex items-end justify-center gap-5 sm:gap-10">
          <div className="animate-slide-left [animation-delay:150ms]">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted">Kamu</div>
            <div className={`font-display text-8xl font-bold leading-none tabular-nums sm:text-9xl ${done && !draw ? (won ? "text-cyan" : "text-bad") : ""}`}>{myScore}</div>
            <div className="mt-1 text-xs text-muted">{(mine.totalMs / 1000).toFixed(1)} detik</div>
          </div>
          <div className="pb-8 font-display text-3xl italic text-muted">VS</div>
          <div className="animate-slide-right [animation-delay:150ms]">
            <div className="max-w-[8rem] truncate text-xs font-semibold uppercase tracking-widest text-muted">{oppName}</div>
            <div className={`font-display text-8xl font-bold leading-none tabular-nums sm:text-9xl ${done && !draw ? (won ? "text-bad" : "text-cyan") : "text-ink-soft"}`}>{theirs ? theirScore : "?"}</div>
            <div className="mt-1 text-xs text-muted">{theirs ? `${(theirs.totalMs / 1000).toFixed(1)} detik` : declined ? "menolak" : "belum main"}</div>
          </div>
        </div>
        {done && (
          <div className={`mx-auto mt-6 inline-block animate-slam bg-navy-3 px-6 py-2 [animation-delay:700ms] [clip-path:polygon(14px_0,100%_0,calc(100%-14px)_100%,0_100%)] ${delta >= 0 ? "text-cyan" : "text-bad"}`} aria-label={`Rating ${delta >= 0 ? "+" : ""}${delta}`}>
            <span className="mr-3 text-xs font-semibold uppercase tracking-widest text-muted">Rating</span>
            <span aria-hidden className="font-display text-5xl font-bold tabular-nums">{shownDelta >= 0 ? "+" : ""}{shownDelta}</span>
          </div>
        )}
        {declined && <p className="mt-4 text-sm text-muted">Rating tidak berubah. Jawabanmu tetap dipakai untuk topik yang perlu diperkuat.</p>}
        {!done && !declined && <p className="mt-4 text-sm text-muted">Hasil akhir muncul setelah {oppName} selesai menjawab.</p>}
      </div>

      <Section title="Topik yang perlu diperkuat">
        {missed.length ? (
          <div className="flex flex-wrap gap-2">{missed.map((t) => <span key={t} className="badge-bad">{t}</span>)}</div>
        ) : (
          <p className="text-sm text-muted">Semua jawaban benar.</p>
        )}
      </Section>

      <Section title="Teman belajar untukmu">
        <PartnerList courseId={duel.courseId} focusTopics={missed} limit={3} />
      </Section>

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
                {q.proposedBy && <div className="text-xs text-muted">Diusulkan oleh {q.proposedBy.name}</div>}
              </li>
            );
          })}
        </ol>
      </details>

      <div className="flex gap-2">
        <Link href={`/duel/new?quiz=${duel.quizId}`} className="btn-primary">Duel lagi</Link>
        <Link href={`/courses/${duel.courseId}`} className="btn-ghost">Ke mata kuliah</Link>
      </div>
    </Page>
  );
}
