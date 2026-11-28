"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { serverNow } from "@/lib/db";
import { useDoc } from "@/lib/live";
import { acceptInvite, cancelInvite, clock, duelState, expireInvite, inviteMsLeft, missedTopics, SECONDS_PER_QUESTION, startAtOf, submitDuel } from "@/lib/peerseus";
import type { Duel } from "@/lib/types";
import { ErrorState, NotFound, Page, Section, Spinner, useCountUp } from "@/components/ui";
import { DiscussLink, useQuestionDiscussions } from "@/components/DiscussLink";
import { InviteActions, useNow } from "@/components/DuelInvites";
import PartnerList from "@/components/PartnerList";
import { MathText } from "@/components/Markdown";

export default function DuelPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const uid = profile!.id;
  // Live: the waiting room, the accept, and the other player's result all arrive without reloading.
  const { data: duel, loading, error } = useDoc<Duel>("duels", id);
  const now = useNow(duel?.status === "invited");

  if (error) return <ErrorState message={error.message} onRetry={() => location.reload()} />;
  if (loading) return <Spinner />;
  if (!duel) return <NotFound title="Duel tidak ditemukan" back={{ href: "/duels", label: "Ke daftar duel" }} />;
  const role = duel.challengerId === uid ? "challenger" : duel.opponentId === uid ? "opponent" : null;
  if (!role) return <NotFound title="Kamu bukan peserta duel ini" back={{ href: "/duels", label: "Ke daftar duel" }} />;
  if (duel[role]) return <Result duel={duel} uid={uid} />;
  const state = duelState(duel, now);
  if (state === "invited") return role === "challenger" ? <WaitingRoom duel={duel} uid={uid} now={now} /> : <Invited duel={duel} uid={uid} now={now} />;
  if (state === "ready" || state === "playing") return <Play duel={duel} uid={uid} />;
  return <Ended duel={duel} uid={uid} />;
}

/** VS heading shared by the waiting room, the invite and the start countdown. */
function Versus({ duel, uid }: { duel: Duel; uid: string }) {
  const opp = duel.challengerId === uid ? duel.opponentName : duel.challengerName;
  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <span className="animate-slide-left font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">Kamu</span>
        <span className="animate-slam font-display text-6xl font-bold italic text-cyan [animation-delay:200ms] sm:text-7xl">VS</span>
        <h1 className="animate-slide-right min-w-0 break-words font-display text-4xl font-bold uppercase tracking-tight text-ink sm:text-5xl">{opp}</h1>
      </div>
      <p className="text-sm text-muted">{duel.quizTitle} · {duel.questions.length} soal · {SECONDS_PER_QUESTION} detik per soal</p>
    </>
  );
}

/** The challenger waits up to 2 minutes for an answer; a demo peer accepts by itself after 1–2 seconds. */
function WaitingRoom({ duel, uid, now }: { duel: Duel; uid: string; now: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const left = inviteMsLeft(duel, now);

  useEffect(() => {
    if (!duel.opponentIsBot) return;
    const t = setTimeout(() => acceptInvite(duel.id, uid).catch((e) => setError(e.message)), 1000 + Math.random() * 1000);
    return () => clearTimeout(t);
  }, [duel.id, duel.opponentIsBot, uid]);

  // At 0:00 the invite is over; a little later it is also marked "expired" (the rules check the server's clock).
  useEffect(() => {
    if (duel.invitedAt === undefined) return;
    const t = setTimeout(() => void expireInvite(duel.id), Math.max(0, duel.invitedAt + 2 * 60 * 1000 + 2000 - serverNow()));
    return () => clearTimeout(t);
  }, [duel.id, duel.invitedAt]);

  async function cancel() {
    setBusy(true);
    setError("");
    try {
      await cancelInvite(duel.id, uid);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membatalkan");
      setBusy(false);
    }
  }

  return (
    <Page width="narrow">
      <div className="card space-y-5 text-center !p-8">
        <div className="eyebrow">Menunggu {duel.opponentName} menerima</div>
        <Versus duel={duel} uid={uid} />
        <div className="font-display text-6xl font-bold tabular-nums text-cyan" aria-label={`Sisa waktu ${clock(left)}`}>{clock(left)}</div>
        <p className="text-sm text-muted">Begitu diterima, kalian berdua langsung masuk ke duel.</p>
        <button className="btn-ghost" disabled={busy} onClick={cancel}>{busy ? "Membatalkan…" : "Batal"}</button>
        {error && <p className="text-sm text-bad">{error}</p>}
      </div>
    </Page>
  );
}

/** The opponent opened the invite itself. */
function Invited({ duel, uid, now }: { duel: Duel; uid: string; now: number }) {
  return (
    <Page width="narrow">
      <div className="card space-y-5 text-center !p-8">
        <div className="eyebrow">{duel.challengerName} mengajakmu duel</div>
        <Versus duel={duel} uid={uid} />
        <p className="text-sm text-muted">Sisa <span className="tabular-nums">{clock(inviteMsLeft(duel, now))}</span> untuk menjawab. Menolak tidak mengubah rating siapa pun.</p>
        <InviteActions duel={duel} uid={uid} className="justify-center" />
      </div>
    </Page>
  );
}

/** An invite that ended without a game, or an old turn-based duel that never finished. */
function Ended({ duel, uid }: { duel: Duel; uid: string }) {
  const meC = duel.challengerId === uid;
  const state = duelState(duel);
  const [badge, title] =
    state === "declined" ? ["Ditolak", meC ? `${duel.opponentName} menolak duel ini` : `Kamu menolak ajakan ${duel.challengerName}`]
    : state === "cancelled" ? ["Dibatalkan", meC ? "Kamu membatalkan ajakan ini" : `${duel.challengerName} membatalkan ajakannya`]
    : ["Kedaluwarsa", duel.mode === "live" ? "Ajakan ini tidak dijawab dalam 2 menit" : "Duel bergiliran ini sudah tidak bisa dimainkan"];
  return (
    <Page width="narrow">
      <div className="card space-y-3 text-center !p-8">
        <span className="badge">{badge}</span>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-sm text-muted">{duel.quizTitle} · rating tidak berubah.</p>
        <div className="flex justify-center gap-2 pt-2">
          {meC && <Link href={`/duel/new?quiz=${duel.quizId}`} className="btn-primary">{state === "declined" ? "Cari lawan lain" : "Ajak lagi"}</Link>}
          <Link href="/duels" className="btn-ghost">Ke daftar duel</Link>
        </div>
      </div>
    </Page>
  );
}

/** After the invite is accepted: a shared countdown to startAt (server time), then the questions. */
function Play({ duel, uid }: { duel: Duel; uid: string }) {
  const startAt = startAtOf(duel) ?? 0;
  const now = useNow(true, 250);
  const started = now >= startAt;
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [times, setTimes] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [left, setLeft] = useState(SECONDS_PER_QUESTION);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const t0 = useRef(0);
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
        // On success the live duel document now holds my side, so the page switches to the result.
        await submitDuel(duel.id, uid, a, t).catch((e) => setError(e instanceof Error ? e.message : "Gagal menyimpan jawaban"));
      }
    }, 1100);
  }

  if (!started) {
    const n = Math.max(1, Math.ceil((startAt - now) / 1000));
    return (
      <Page width="narrow">
        <div className="card space-y-5 text-center !p-8">
          <div className="eyebrow">Ajakan diterima</div>
          <Versus duel={duel} uid={uid} />
          <div key={n} className="animate-slam font-display text-8xl font-bold tabular-nums text-cyan" aria-live="polite">{n}</div>
          <p className="text-sm text-muted">Duel mulai bersamaan untuk kalian berdua.</p>
        </div>
      </Page>
    );
  }
  if (error) return <ErrorState title="Jawaban gagal disimpan" message={error} hint="Buka daftar duel untuk melihat keadaannya." />;
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

function Result({ duel, uid }: { duel: Duel; uid: string }) {
  const meC = duel.challengerId === uid;
  const mine = meC ? duel.challenger! : duel.opponent!;
  const theirs = meC ? duel.opponent : duel.challenger;
  const oppName = meC ? duel.opponentName : duel.challengerName;
  const missed = missedTopics(duel, uid);
  const discuss = useQuestionDiscussions(duel.quizId);
  const done = duel.status === "completed";
  const declined = duel.status === "declined";
  // An old turn-based duel the other player never answered: no result, no rating change.
  const expired = duelState(duel) === "expired";
  const won = done && duel.winnerId === uid;
  const draw = done && duel.winnerId === null;
  const delta = done ? (meC ? duel.eloChange!.challenger : duel.eloChange!.opponent) : 0;

  const tone = !done ? "text-ink-soft" : won ? "text-cyan" : draw ? "text-ink" : "text-bad";
  const edge = !done ? "[--card-border:var(--color-line)]" : won ? "[--card-border:var(--color-cyan)]" : draw ? "[--card-border:var(--color-line)]" : "[--card-border:var(--color-bad)]";
  const myScore = useCountUp(mine.score, 700, 300);
  const theirScore = useCountUp(theirs ? theirs.score : 0, 700, 450);
  const shownDelta = useCountUp(delta, 1400, 800);
  const verdict = declined ? "Ditolak" : expired ? "Kedaluwarsa" : !done ? "Menunggu" : won ? "Menang" : draw ? "Seri" : "Kalah";

  return (
    <Page width="narrow">
      <div className={`card [overflow:clip] [overflow-clip-margin:12px] text-center !p-8 ${edge}`}>
        <div className="eyebrow">{declined ? `${oppName} menolak duel ini` : expired ? `${oppName} tidak menjawab` : !done ? `Menunggu ${oppName}` : `Duel melawan ${oppName}`}</div>
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
            <div className="mt-1 text-xs text-muted">{theirs ? `${(theirs.totalMs / 1000).toFixed(1)} detik` : declined ? "menolak" : expired ? "tidak main" : "belum main"}</div>
          </div>
        </div>
        {done && (
          <div className={`mx-auto mt-6 inline-block animate-slam bg-navy-3 px-6 py-2 [animation-delay:700ms] [clip-path:polygon(14px_0,100%_0,calc(100%-14px)_100%,0_100%)] ${delta >= 0 ? "text-cyan" : "text-bad"}`} aria-label={`Rating ${delta >= 0 ? "+" : ""}${delta}`}>
            <span className="mr-3 text-xs font-semibold uppercase tracking-widest text-muted">Rating</span>
            <span aria-hidden className="font-display text-5xl font-bold tabular-nums">{shownDelta >= 0 ? "+" : ""}{shownDelta}</span>
          </div>
        )}
        {(declined || expired) && <p className="mt-4 text-sm text-muted">Rating tidak berubah. Jawabanmu tetap dipakai untuk topik yang perlu diperkuat.</p>}
        {!done && !declined && !expired && <p className="mt-4 text-sm text-muted">Hasil akhir muncul setelah {oppName} selesai menjawab.</p>}
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
                <DiscussLink info={discuss} questionId={q.id} />
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
