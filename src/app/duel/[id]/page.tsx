"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { recordActivityQuietly } from "@/lib/activity";
import { useAuth } from "@/lib/auth";
import { displayOpponentName, ladderAnswer, ladderBot, LADDER_BOTS } from "@/lib/bots";
import { serverNow } from "@/lib/db";
import { useDoc } from "@/lib/live";
import {
  acceptInvite, botAnswer, cancelInvite, clock, decidedByTime, deadlineOf, duelState, END_GRACE_MS, endReason, expireInvite, getMembership, HEARTBEAT_MS,
  heartbeat, inviteMsLeft, liveOf, missedTopics, other, QUESTION_MS, roleOf, saveLiveSide, SECONDS_PER_QUESTION, settleDuel, startAtOf,
} from "@/lib/peerseus";
import type { Duel } from "@/lib/types";
import { ErrorState, NotFound, Page, Section, Spinner, useCountUp } from "@/components/ui";
import { DiscussLink, useQuestionDiscussions } from "@/components/DiscussLink";
import { InviteActions, useNow } from "@/components/DuelInvites";
import PartnerList from "@/components/PartnerList";
import { StreakNotice } from "@/components/Streak";
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
  const opp = displayOpponentName(duel, duel.challengerId === uid ? duel.opponentId : duel.challengerId);
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
        <div className="eyebrow">Menunggu {displayOpponentName(duel, duel.opponentId)} menerima</div>
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
    state === "declined" ? ["Ditolak", meC ? `${displayOpponentName(duel, duel.opponentId)} menolak duel ini` : `Kamu menolak ajakan ${duel.challengerName}`]
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

/**
 * The live game. Before startAt (server time): VS screen and 3-2-1. Then each player answers at their own pace
 * (20 s per question), saving only their own side, with a heartbeat every 10 s. Whoever's browser sees the duel
 * over (both done, time up, or a player silent for 30 s) settles it in one transaction; the page then shows
 * the result. Against a demo peer, this (the challenger's) browser also plays the peer's side.
 */
function Play({ duel, uid }: { duel: Duel; uid: string }) {
  const role = roleOf(duel, uid)!;
  const total = duel.questions.length;
  const startAt = startAtOf(duel) ?? 0;
  const lastQuestionEnds = (deadlineOf(duel) ?? 0) - END_GRACE_MS;
  const now = useNow(true, 250);
  const started = now >= startAt;
  const mine = liveOf(duel, role);
  const theirs = liveOf(duel, other(role));
  // Resume after a reload: answers already saved stay, the next question starts fresh.
  const [answers, setAnswers] = useState<number[]>(() => mine?.answers ?? []);
  const [times, setTimes] = useState<number[]>(() => mine?.timesMs ?? []);
  const [i, setI] = useState(() => mine?.answers?.length ?? 0);
  const [picked, setPicked] = useState<number | null>(null);
  const [left, setLeft] = useState(SECONDS_PER_QUESTION);
  const shownAt = useRef(0);
  const latest = useRef(duel);
  latest.current = duel;
  const lastSettle = useRef(0);
  const q = duel.questions[i];
  const done = i >= total;

  // Heartbeat from the start until the page closes (also while waiting for the opponent).
  useEffect(() => {
    if (!started) return;
    const beat = () => void heartbeat(latest.current, role).catch(() => undefined);
    beat();
    const iv = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(iv);
  }, [started, role]);

  // Settle as soon as the duel is over; settleDuel does nothing if it isn't (or is already settled).
  const over = endReason(duel, now) !== null;
  useEffect(() => {
    if (!over || Date.now() - lastSettle.current < 3000) return;
    lastSettle.current = Date.now();
    void settleDuel(duel.id).catch(() => undefined);
  }, [over, now, duel.id]);

  // Demo peer: answers one question at a time after a human-like pause, from the challenger's browser.
  const botPlays = started && role === "challenger" && !!duel.opponentIsBot;
  useEffect(() => {
    if (!botPlays) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const d = latest.current;
    // A ladder bot has no membership: fixed accuracy and pause per level. An old demo friend answers by its topic stats.
    const ladder = ladderBot(d.opponentId);
    (ladder ? Promise.resolve(null) : getMembership(d.courseId, d.opponentId)).then((bot) => {
      if (stop || (!bot && !ladder)) return;
      const saved = latest.current.opponentLive;
      const a = [...(saved?.answers ?? [])], t = [...(saved?.timesMs ?? [])];
      const next = () => {
        if (stop || a.length >= d.questions.length) return;
        const { answer, ms } = ladder ? ladderAnswer(ladder, d.questions[a.length]) : botAnswer(bot!, d.questions[a.length]);
        timer = setTimeout(() => {
          if (stop) return;
          a.push(answer);
          t.push(ms);
          void saveLiveSide(latest.current, "opponent", [...a], [...t]).catch(() => undefined);
          next();
        }, ms);
      };
      next();
    });
    return () => {
      stop = true;
      clearTimeout(timer);
    };
    // Only (re)starts when play starts: every live update makes a new duel object, which must not reset the bot.
  }, [botPlays]);

  // Per-question clock: 20 s from when it appears, never past the last question's end.
  useEffect(() => {
    if (!started || done || picked !== null) return;
    shownAt.current = Date.now();
    const tick = () => {
      const l = Math.min(
        SECONDS_PER_QUESTION - Math.floor((Date.now() - shownAt.current) / 1000),
        Math.floor((lastQuestionEnds - serverNow()) / 1000),
      );
      setLeft(l);
      if (l <= 0) choose(-1);
    };
    tick();
    const iv = setInterval(tick, 250);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, i, picked, done]);

  function choose(k: number) {
    if (picked !== null || done) return;
    setPicked(k);
    const ms = Math.max(0, Math.min(Date.now() - shownAt.current, QUESTION_MS));
    const a = [...answers, k], t = [...times, ms];
    setAnswers(a);
    setTimes(t);
    // A failed save (e.g. the duel was just settled) shows up as the live document changing to the result.
    void saveLiveSide(latest.current, role, a, t).catch(() => undefined);
    setTimeout(() => {
      setI((x) => x + 1);
      setPicked(null);
    }, 1100);
  }

  const theirCount = theirs?.answers?.length ?? 0;
  const progress = theirCount >= total ? "Lawan: selesai" : `Lawan: soal ${theirCount + 1}/${total}`;

  if (!started) {
    const n = Math.ceil((startAt - now) / 1000);
    return (
      <Page width="narrow">
        <div className="card space-y-5 text-center !p-8">
          <div className="eyebrow">Ajakan diterima</div>
          <Versus duel={duel} uid={uid} />
          {n <= 3 ? (
            <div key={n} className="animate-slam font-display text-8xl font-bold tabular-nums text-cyan" aria-live="assertive">{Math.max(n, 1)}</div>
          ) : (
            <p className="font-display text-2xl uppercase tracking-widest text-cyan" aria-live="polite">Siap-siap…</p>
          )}
          <p className="text-sm text-muted">Duel mulai bersamaan untuk kalian berdua.</p>
        </div>
      </Page>
    );
  }

  if (done) {
    return (
      <Page width="narrow">
        <div className="card space-y-4 text-center !p-8">
          <div className="eyebrow">Kamu selesai</div>
          <h1 className="font-display text-4xl font-bold uppercase">Menunggu lawan</h1>
          <p className="font-display text-2xl tabular-nums text-cyan" aria-live="polite">{progress}</p>
          <p className="text-sm text-muted">Hasil muncul begitu lawan selesai. Kalau lawan berhenti menjawab 30 detik, sisa soalnya dihitung salah.</p>
        </div>
      </Page>
    );
  }

  return (
    <Page width="narrow">
      <div>
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">Soal {i + 1} dari {total} <span className="text-muted">· {q.topic}</span></span>
          <span className={`font-display text-3xl font-bold tabular-nums ${left <= 5 ? "inline-block animate-tick text-bad" : "text-cyan"}`}>{Math.max(left, 0)}<span className="ml-1 text-sm font-medium uppercase tracking-wider text-muted">detik</span></span>
        </div>
        <div className="mb-2 h-1.5 bg-line">
          <div className={`h-1.5 transition-all ${left <= 5 ? "bg-bad" : "bg-cyan"}`} style={{ width: `${(Math.max(left, 0) / SECONDS_PER_QUESTION) * 100}%` }} />
        </div>
        <p className="mb-4 text-right text-xs font-semibold uppercase tracking-widest text-muted tabular-nums" aria-live="polite">{progress}</p>
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
  const oppName = displayOpponentName(duel, meC ? duel.opponentId : duel.challengerId);
  const missed = missedTopics(duel, uid);
  // Pembahasan: wrong questions first (keeping their original numbers), open by default when there is one.
  const review = duel.questions.map((q, i) => ({ q, i, ok: mine.answers[i] === q.answerIndex })).sort((a, b) => Number(a.ok) - Number(b.ok) || a.i - b.i);
  const wrongCount = review.filter((r) => !r.ok).length;
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
  const ladder = ladderBot(meC ? duel.opponentId : duel.challengerId);
  const byTime = decidedByTime(duel);
  // Streak: a finished duel counts once for the day it finished. Only a duel that just ended is recorded, so opening an old one changes nothing.
  const [streakMsg, setStreakMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!done || typeof duel.completedAt !== "number" || serverNow() - duel.completedAt > 30 * 60 * 1000) return;
    void recordActivityQuietly(uid, duel.completedAt).then((r) => { if (r?.message) setStreakMsg(r.message); });
  }, [done, duel.completedAt, uid]);
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
        {byTime && (
          <p className="mx-auto mt-5 max-w-sm text-sm text-ink-soft">
            <span className="font-semibold text-ink">Skor sama, yang lebih cepat menang.</span>{" "}
            Total waktu kamu {(mine.totalMs / 1000).toFixed(1)} detik, {oppName} {(theirs!.totalMs / 1000).toFixed(1)} detik.
          </p>
        )}
        {done && !duel.opponentIsBot && (
          <div className={`mx-auto mt-6 inline-block animate-slam bg-navy-3 px-6 py-2 [animation-delay:700ms] [clip-path:polygon(14px_0,100%_0,calc(100%-14px)_100%,0_100%)] ${delta >= 0 ? "text-cyan" : "text-bad"}`} aria-label={`Rating ${delta >= 0 ? "+" : ""}${delta}`}>
            <span className="mr-3 text-xs font-semibold uppercase tracking-widest text-muted">Rating</span>
            <span aria-hidden className="font-display text-5xl font-bold tabular-nums">{shownDelta >= 0 ? "+" : ""}{shownDelta}</span>
          </div>
        )}
        {done && ladder && (
          <>
            <p className="mt-4 text-lg font-semibold">{won ? `Kamu mengalahkan ${oppName}!` : draw ? `Seri melawan ${oppName}` : `${oppName} menang kali ini`}</p>
            {won && ladder.level === LADDER_BOTS.length && <p className="mt-1 text-lg font-semibold text-cyan">Kamu sampai di Ithaca!</p>}
            <p className="mt-1 text-sm text-muted">Lawan bot: rating tidak berubah dan tidak masuk hitungan menang/kalah. Topik yang kamu jawab tetap tercatat.</p>
          </>
        )}
        {done && duel.opponentIsBot && !ladder && <p className="mt-4 text-sm text-muted">Lawan teman demo: rating tidak berubah. Topik yang kamu jawab tetap tercatat.</p>}
        {done && duel.endReason === "left" && <p className="mt-2 text-sm text-muted">Ada pemain yang berhenti menjawab lebih dari 30 detik, jadi sisa soalnya dihitung salah.</p>}
        {done && duel.endReason === "timeout" && <p className="mt-2 text-sm text-muted">Waktu duel habis; soal yang belum dijawab dihitung salah.</p>}
        {(declined || expired) && <p className="mt-4 text-sm text-muted">Rating tidak berubah. Jawabanmu tetap dipakai untuk topik yang perlu diperkuat.</p>}
        {!done && !declined && !expired && <p className="mt-4 text-sm text-muted">Hasil akhir muncul setelah {oppName} selesai menjawab.</p>}
      </div>

      <StreakNotice message={streakMsg} />

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

      <details className="card" open={wrongCount > 0}>
        <summary className="cursor-pointer font-semibold">Pembahasan soal{wrongCount > 0 && <span className="ml-2 text-sm font-normal text-bad">{wrongCount} soal salah</span>}</summary>
        <ol className="mt-4 space-y-4">
          {review.map(({ q, i }) => {
            const a = mine.answers[i];
            const ok = a === q.answerIndex;
            return (
              <li key={q.id} className="border-b border-line pb-3 text-sm last:border-0">
                <div className="font-medium"><span className={ok ? "text-good" : "text-bad"}>{i + 1}. {ok ? "Benar" : "Salah"}</span> · <MathText text={q.question} /></div>
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
        <Link href={`/duel/new?quiz=${duel.quizId}${ladder ? "&tab=bot" : ""}`} className="btn-primary">{ladder ? "Lawan bot lagi" : "Duel lagi"}</Link>
        <Link href={`/courses/${duel.courseId}`} className="btn-ghost">Ke mata kuliah</Link>
      </div>
    </Page>
  );
}
