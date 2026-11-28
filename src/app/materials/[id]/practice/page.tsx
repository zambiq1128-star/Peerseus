"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { recordActivityQuietly } from "@/lib/activity";
import { db } from "@/lib/db";
import { getMaterial } from "@/lib/peerseus";
import {
  clampMinutes, clearRun, defaultPracticeMinutes, finishRun, formatClock, formatDuration, loadRun, minutesLabel,
  practiceMissedTopics, PRACTICE_MAX_MINUTES, PRACTICE_PRESETS, runQuestions, saveRun, startRun, type PracticeRun,
} from "@/lib/practice";
import type { PracticeAttempt, Quiz } from "@/lib/types";
import { Empty, ErrorState, NotFound, Page, PageHeader, Section, Spinner, useAsync } from "@/components/ui";
import { MathText } from "@/components/Markdown";
import { DiscussLink, useQuestionDiscussions } from "@/components/DiscussLink";
import PartnerList from "@/components/PartnerList";
import { StreakNotice } from "@/components/Streak";

/** Kuis mandiri: all questions of a published quiz, one time limit the user picks, answers shown at the end. */
export default function PracticePage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useAsync(async () => {
    const material = await getMaterial(id);
    const quiz = material && material.isPublic !== false ? await db.get<Quiz>("quizzes", `quiz_${id}`) : null;
    return { material, quiz };
  }, [id]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  const { material, quiz } = data;
  if (!material) return <NotFound title="Materi tidak ditemukan" />;
  if (quiz?.status !== "published") {
    return (
      <Page width="narrow">
        <PageHeader back={{ href: `/materials/${id}`, label: "Kembali ke materi" }} title="Latihan sendiri" />
        <Empty title="Belum ada kuis">Latihan sendiri bisa dipakai setelah pengunggah mempublikasikan kuis untuk materi publik ini.</Empty>
      </Page>
    );
  }
  return <Practice quiz={quiz} />;
}

type Phase = { kind: "start" } | { kind: "play"; run: PracticeRun } | { kind: "result"; run: PracticeRun; attempt: PracticeAttempt; timedOut: boolean };

function Practice({ quiz }: { quiz: Quiz }) {
  const { profile } = useAuth();
  const uid = profile!.id;
  const [phase, setPhase] = useState<Phase>(() => {
    const run = loadRun(uid, quiz.id);
    // A run whose questions were all deleted meanwhile can't continue: start over.
    if (run && !runQuestions(quiz, run).length) clearRun(uid, quiz.id);
    return run && runQuestions(quiz, run).length ? { kind: "play", run } : { kind: "start" };
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [streakMsg, setStreakMsg] = useState<string | null>(null);
  const submitting = useRef(false);

  const submit = useCallback(async (run: PracticeRun) => {
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setErr("");
    try {
      const attempt = await finishRun(uid, quiz, run);
      setStreakMsg((await recordActivityQuietly(uid))?.message ?? null);
      setPhase({ kind: "result", run, attempt, timedOut: Date.now() >= run.deadline });
    } catch (e) {
      // The run stays in this browser, so handing it in can be tried again.
      setErr((e as Error).message || "Gagal menyimpan hasil.");
    }
    submitting.current = false;
    setSaving(false);
  }, [uid, quiz]);

  if (saving) return <Spinner label="Menghitung hasil…" />;
  if (phase.kind === "start") return <Start quiz={quiz} onStart={(m) => setPhase({ kind: "play", run: startRun(uid, quiz, m) })} />;
  if (phase.kind === "result") return <Result quiz={quiz} {...phase} streakMsg={streakMsg} onAgain={() => setPhase({ kind: "start" })} />;
  return (
    <Play
      quiz={quiz}
      run={phase.run}
      err={err}
      onChange={(run) => { saveRun(uid, run); setPhase({ kind: "play", run }); }}
      onSubmit={submit}
    />
  );
}

function Start({ quiz, onStart }: { quiz: Quiz; onStart: (minutes: number) => void }) {
  const n = quiz.questions.length;
  const [text, setText] = useState(String(defaultPracticeMinutes(n)));
  const minutes = Number(text);
  const valid = Number.isInteger(minutes) && minutes >= 1 && minutes <= PRACTICE_MAX_MINUTES;

  return (
    <Page width="narrow">
      <PageHeader back={{ href: `/materials/${quiz.materialId}`, label: "Kembali ke materi" }} eyebrow="Latihan sendiri" title={quiz.title} sub={`${n} soal, urutan diacak. Tidak mengubah rating.`} />
      <div className="card space-y-4">
        <div>
          <div className="label">Batas waktu untuk seluruh kuis</div>
          <div className="flex flex-wrap gap-2">
            {PRACTICE_PRESETS.map((m) => (
              <button key={m} type="button" className={minutes === m ? "chip-active" : "chip"} onClick={() => setText(String(m))}>{minutesLabel(m)}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="minutes">Atau isi sendiri (menit)</label>
          <input id="minutes" className="input max-w-32" type="number" inputMode="numeric" min={1} max={PRACTICE_MAX_MINUTES} step={1} value={text} onChange={(e) => setText(e.target.value)} />
          {!valid && <p className="mt-1 text-xs text-bad">Isi angka bulat 1 sampai {PRACTICE_MAX_MINUTES} menit.</p>}
        </div>
        <p className="text-sm text-muted">
          Kamu bisa pindah ke soal mana pun dan mengganti jawaban sebelum mengumpulkan. Jawaban benar dan pembahasan muncul setelah dikumpulkan.
          Kalau halaman tertutup, buka lagi di browser ini untuk melanjutkan; waktunya tetap berjalan.
        </p>
        <button className="btn-primary w-full !py-3" disabled={!valid} onClick={() => onStart(clampMinutes(minutes))}>
          Mulai{valid ? ` (${minutesLabel(minutes)})` : ""}
        </button>
      </div>
    </Page>
  );
}

function Play({ quiz, run, err, onChange, onSubmit }: {
  quiz: Quiz;
  run: PracticeRun;
  err: string;
  onChange: (run: PracticeRun) => void;
  onSubmit: (run: PracticeRun) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [confirming, setConfirming] = useState(false);
  const items = runQuestions(quiz, run);
  const k = Math.min(run.current, items.length - 1);
  const { question: q, answer, slot } = items[k];
  const left = run.deadline - now;
  const empty = items.filter((x) => x.answer === -1).length;

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(iv);
  }, []);
  // Time is up (also when the page reopens after the deadline): hand in what is there.
  useEffect(() => {
    if (left <= 0 && !err) onSubmit(run);
  }, [left, err, run, onSubmit]);

  const go = (i: number) => { setConfirming(false); onChange({ ...run, current: i }); };
  const pick = (opt: number) => onChange({ ...run, answers: run.answers.map((a, j) => (j === slot ? (a === opt ? -1 : opt) : a)) });

  return (
    <Page width="narrow">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-medium">Soal {k + 1} dari {items.length} <span className="text-muted">· {q.topic}</span></span>
          <span className={`font-semibold tabular-nums ${left <= 60_000 ? "text-bad" : ""}`} aria-label="Sisa waktu">Sisa {formatClock(left)}</span>
        </div>
        <div className="h-1 rounded-full bg-line">
          <div className="h-1 rounded-full bg-accent transition-all" style={{ width: `${Math.max(0, Math.min(1, left / (run.limitMinutes * 60_000))) * 100}%` }} />
        </div>

        <nav aria-label="Daftar soal" className="flex flex-wrap gap-1.5">
          {items.map((x, i) => (
            <button key={i} type="button" onClick={() => go(i)} aria-current={i === k ? "step" : undefined}
              className={`h-8 min-w-8 rounded-control border px-2 text-xs font-semibold tabular-nums transition-colors ${i === k ? "border-accent ring-2 ring-accent/30" : "border-line"} ${x.answer !== -1 ? "bg-accent-soft text-ink" : "bg-surface text-muted"}`}>
              {i + 1}
            </button>
          ))}
        </nav>

        <div key={k} className="card animate-page-in !p-6">
          <h2 className="text-lg font-semibold leading-snug"><MathText text={q.question} /></h2>
          <div className="mt-5 grid gap-2">
            {q.options.map((o, opt) => (
              <button key={opt} type="button" onClick={() => pick(opt)} aria-pressed={answer === opt}
                className={`rounded-control border p-3 text-left text-sm transition ${answer === opt ? "border-accent bg-accent-soft font-medium ring-2 ring-accent/30" : "border-line hover:border-accent"}`}>
                <span className="mr-2 font-semibold text-muted">{"ABCD"[opt]}</span><MathText text={o} />
              </button>
            ))}
          </div>
          {answer !== -1 && <p className="mt-2 text-xs text-muted">Klik jawaban yang sama lagi untuk mengosongkannya.</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button className="btn-ghost" onClick={() => go(k - 1)} disabled={k === 0}>Sebelumnya</button>
          <span className="text-xs text-muted">{items.length - empty} dari {items.length} dijawab</span>
          {k < items.length - 1
            ? <button className="btn-ghost" onClick={() => go(k + 1)}>Berikutnya</button>
            : <button className="btn-primary" onClick={() => (empty ? setConfirming(true) : onSubmit(run))}>Kumpulkan</button>}
        </div>
        {k < items.length - 1 && (
          <div className="text-right">
            <button className="link text-sm" onClick={() => (empty ? setConfirming(true) : onSubmit(run))}>Kumpulkan sekarang</button>
          </div>
        )}
        {confirming && (
          <div className="callout flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm">Masih ada {empty} soal kosong, dan soal kosong dihitung salah. Kumpulkan sekarang?</span>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => setConfirming(false)}>Batal</button>
              <button className="btn-primary" onClick={() => onSubmit(run)}>Ya, kumpulkan</button>
            </div>
          </div>
        )}
        {err && (
          <div className="card flex flex-wrap items-center justify-between gap-3 [--card-border:var(--color-bad)]">
            <span className="text-sm text-bad">Hasil belum tersimpan: {err}</span>
            <button className="btn-primary" onClick={() => onSubmit(run)}>Coba lagi</button>
          </div>
        )}
      </div>
    </Page>
  );
}

function Result({ quiz, run, attempt, timedOut, streakMsg, onAgain }: { quiz: Quiz; run: PracticeRun; attempt: PracticeAttempt; timedOut: boolean; streakMsg: string | null; onAgain: () => void }) {
  const items = runQuestions(quiz, run);
  const missed = practiceMissedTopics(items);
  const discuss = useQuestionDiscussions(quiz.id);
  const pct = attempt.total ? Math.round((attempt.score / attempt.total) * 100) : 0;

  return (
    <Page width="narrow">
      <div className="card text-center !p-8">
        <div className="eyebrow">Latihan sendiri · {quiz.title}</div>
        <div className="mt-2 text-5xl font-bold tabular-nums">{attempt.score}<span className="text-2xl text-muted">/{attempt.total}</span></div>
        <div className="mt-1 text-sm text-muted">{pct}% benar · {formatDuration(attempt.usedMs)} dari batas {minutesLabel(attempt.limitMinutes)}</div>
        {timedOut && <p className="mt-3 text-sm text-bad">Waktu habis, jawabanmu dikumpulkan otomatis.</p>}
        <p className="mt-3 text-xs text-muted">Tersimpan di riwayat latihanmu (hanya kamu yang bisa melihat). Rating tidak berubah.</p>
      </div>

      <StreakNotice message={streakMsg} />

      <Section title="Topik yang perlu diperkuat">
        {missed.length ? (
          <div className="flex flex-wrap gap-2">{missed.map((t) => <span key={t} className="badge-bad">{t}</span>)}</div>
        ) : (
          <p className="text-sm text-muted">Semua jawaban benar.</p>
        )}
      </Section>

      {missed.length > 0 && (
        <Section title="Teman belajar untukmu">
          <PartnerList courseId={quiz.courseId} focusTopics={missed} limit={3} />
        </Section>
      )}

      <Section title="Pembahasan soal">
        <ol className="card space-y-4">
          {items.map(({ question: q, answer: a }, i) => {
            const ok = a === q.answerIndex;
            return (
              <li key={i} className="border-b border-line pb-3 text-sm last:border-0 last:pb-0">
                <div className="font-medium">
                  <span className={ok ? "text-good" : "text-bad"}>{i + 1}. {ok ? "Benar" : a === -1 ? "Kosong" : "Salah"}</span> · <MathText text={q.question} />
                </div>
                <div className="mt-1">
                  Jawaban: <b><MathText text={q.options[q.answerIndex]} /></b>
                  {!ok && a !== -1 && <span className="text-bad"> · kamu: <MathText text={q.options[a]} /></span>}
                </div>
                {q.explanation && <div className="text-xs text-muted"><MathText text={q.explanation} /></div>}
                {q.proposedBy && <div className="text-xs text-muted">Diusulkan oleh {q.proposedBy.name}</div>}
                <DiscussLink info={discuss} questionId={q.id} />
              </li>
            );
          })}
        </ol>
      </Section>

      <div className="flex gap-2">
        <button className="btn-primary" onClick={onAgain}>Latihan lagi</button>
        <Link href={`/materials/${quiz.materialId}`} className="btn-ghost">Ke materi</Link>
      </div>
    </Page>
  );
}
