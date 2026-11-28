"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAuth } from "@/lib/auth";
import { LADDER_BOTS, type LadderBot } from "@/lib/bots";
import { db } from "@/lib/db";
import { activeOutgoingInvite, createInvite, defeatedLadderBots, DUEL_QUESTIONS, ensureLadderBots, getMembership, joinCourse, SECONDS_PER_QUESTION, suggestOpponents } from "@/lib/peerseus";
import type { Course, Quiz } from "@/lib/types";
import { Empty, ErrorState, Page, PageHeader, Spinner, useAsync } from "@/components/ui";

export default function NewDuelPage() {
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
  const [tab, setTab] = useState<"teman" | "bot">(sp.get("tab") === "bot" ? "bot" : "teman");
  const [botId, setBotId] = useState(LADDER_BOTS[0].id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const { data, error, reload } = useAsync(async () => {
    let courseId = courseParam;
    if (quizParam) {
      // "Ajak lagi" / "Duel lagi" from an old duel whose material (and quiz) was deleted since.
      const q = await db.get<Quiz>("quizzes", quizParam);
      if (!q) return { gone: true as const };
      courseId = q.courseId;
    }
    if (!courseId) return null;
    const course = await db.get<Course>("courses", courseId);
    const quizzes = (await db.list<Quiz>("quizzes", [["courseId", "==", courseId]])).filter((q) => q.status === "published");
    const me = await getMembership(courseId, uid);
    const opponents = await suggestOpponents(courseId, uid);
    // Only one outgoing invite may wait at a time.
    const waiting = await activeOutgoingInvite(uid);
    // Keep users/bot_* in step with bots.ts (new names); failure here must not block the page.
    ensureLadderBots().catch(() => {});
    const beaten = await defeatedLadderBots(uid, courseId);
    return { course, quizzes, opponents, me, waiting, beaten };
  }, [quizParam, courseParam, uid]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (data === undefined) return <Spinner />;
  if (data && "gone" in data) {
    return <NoDuel title="Kuis ini sudah dihapus" back={{ href: "/", label: "Ke mata kuliahku" }}>Materinya sudah dihapus pengunggahnya. Riwayat duelnya tetap ada; pilih kuis lain dari halaman mata kuliah.</NoDuel>;
  }
  if (!data || !data.course) {
    return <NoDuel title="Pilih kuis dulu" back={{ href: "/", label: "Ke mata kuliahku" }}>Buka materi yang sudah punya kuis, lalu klik “Mulai duel”.</NoDuel>;
  }
  const back = { href: `/courses/${data.course.id}`, label: `Ke ${data.course.code}` };
  if (!data.quizzes.length) return <NoDuel title="Belum ada kuis di mata kuliah ini" back={back}>Upload materi lalu buat kuisnya dulu.</NoDuel>;

  // Sensible defaults so the user can start with one click.
  const quiz = data.quizzes.find((q) => q.id === (quizId || quizParam)) ?? data.quizzes[0];
  const opp = data.opponents.find((o) => o.uid === (oppId || opponentParam)) ?? data.opponents[0] ?? null;
  const bot = LADDER_BOTS.find((b) => b.id === botId)!;
  const myElo = data.me?.elo ?? 1000;

  async function invite(target: { uid: string; name: string; isBot?: boolean }) {
    setBusy(true);
    setErr("");
    try {
      if (!data!.me || data!.me.left) { await joinCourse(profile!, data!.course!.id); await refresh(); }
      // The invite's page is the waiting room; both players land there when it is accepted.
      router.push(`/duel/${await createInvite(quiz, profile!, target)}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal mengirim ajakan");
      setBusy(false);
    }
  }

  return (
    <Page width="narrow">
      <PageHeader
        back={{ href: `/courses/${data.course.id}`, label: data.course.code }}
        title="Duel kuis"
        sub={`${DUEL_QUESTIONS} soal · ${SECONDS_PER_QUESTION} detik per soal. Skor sama, yang lebih cepat menang.`}
      />

      {data.quizzes.length > 1 && (
        <div>
          <label className="label" htmlFor="qz">Kuis</label>
          <select id="qz" className="input" value={quiz.id} onChange={(e) => setQuizId(e.target.value)}>
            {data.quizzes.map((q) => <option key={q.id} value={q.id}>{q.title} ({q.questions.length} soal)</option>)}
          </select>
        </div>
      )}
      {data.quizzes.length === 1 && <p className="text-sm">Kuis: <b>{quiz.title}</b></p>}

      <div role="tablist" aria-label="Jenis lawan" className="flex gap-2">
        {([["teman", "Lawan teman"], ["bot", "Lawan bot"]] as const).map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={tab === t ? "tab-active" : "tab"}>{label}</button>
        ))}
      </div>

      {tab === "teman" ? (
        opp ? (
          <div>
            <div className="label">Lawan <span className="font-normal text-muted">(urut dari rating terdekat denganmu, {myElo})</span></div>
            <div className="rows">
              {data.opponents.map((o) => (
                <label key={o.uid} className={`flex cursor-pointer items-center justify-between gap-3 p-3 ${opp.uid === o.uid ? "bg-accent-soft" : "hover:bg-navy-3"}`}>
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
        ) : (
          <Empty title="Belum ada teman untuk diajak duel">Belum ada mahasiswa lain di mata kuliah ini. Sambil menunggu, latihan dulu di tab “Lawan bot”.</Empty>
        )
      ) : (
        <div>
          <p className="callout text-sm">Perjalanan pulang ke Ithaca: kalahkan tiap rintangan, dari {LADDER_BOTS[0].name} sampai {LADDER_BOTS[LADDER_BOTS.length - 1].name}.</p>
          <div className="label mt-3">Lawan bot <span className="font-normal text-muted">(urut dari yang paling mudah; rating bot tidak berubah)</span></div>
          <div className="rows">
            {LADDER_BOTS.map((b) => <BotCard key={b.id} bot={b} selected={bot.id === b.id} beaten={data.beaten.has(b.id)} onPick={() => setBotId(b.id)} />)}
          </div>
        </div>
      )}

      {data.waiting ? (
        <div className="callout flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-medium">Ajakanmu ke {data.waiting.opponentName} masih menunggu jawaban.</span>
          <Link href={`/duel/${data.waiting.id}`} className="btn-primary">Lihat ajakan</Link>
        </div>
      ) : tab === "bot" ? (
        <button className="btn-primary w-full !py-3" disabled={busy} onClick={() => invite({ uid: bot.id, name: bot.name, isBot: true })}>{busy ? "Memulai…" : `Lawan ${bot.name}`}</button>
      ) : opp ? (
        <button className="btn-primary w-full !py-3" disabled={busy} onClick={() => invite(opp)}>{busy ? "Mengirim…" : `Ajak duel ${opp.name.split(" ")[0]}`}</button>
      ) : null}
      {err && <p className="text-center text-sm text-bad">{err}</p>}
      <p className="text-center text-xs text-muted">
        {tab === "bot"
          ? `${bot.name} langsung menerima. Duel lawan bot tidak mengubah rating dan tidak masuk hitungan menang/kalah, tapi topik yang kamu jawab tetap tercatat.`
          : opp?.isBot
            ? `${opp.name} teman demo, langsung menerima.`
            : opp && `${opp.name} punya 2 menit untuk menerima. Setelah diterima, kalian main bersamaan.`}
      </p>
    </Page>
  );
}

/** Why a duel can't start yet, with the way back. */
function NoDuel({ title, back, children }: { title: string; back: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <Page width="narrow">
      <PageHeader title="Duel kuis" />
      <Empty title={title} action={<Link href={back.href} className="btn-ghost">{back.label}</Link>}>{children}</Empty>
    </Page>
  );
}

/** One ladder bot: monogram, name, level, rating label, one-line character and a rough accuracy. */
function BotCard({ bot, selected, beaten, onPick }: { bot: LadderBot; selected: boolean; beaten: boolean; onPick: () => void }) {
  return (
    <label className={`flex cursor-pointer items-center gap-3 p-3 ${selected ? "bg-accent-soft" : "hover:bg-navy-3"}`}>
      <input type="radio" name="bot" checked={selected} onChange={onPick} className="shrink-0" />
      <span aria-hidden className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden bg-accent font-display font-bold text-white ${bot.initial.length > 2 ? "text-lg" : "text-3xl"} [clip-path:polygon(8px_0,100%_0,calc(100%-8px)_100%,0_100%)]`}>{bot.initial}</span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold">{bot.name}</span>
          <span className="text-xs text-muted">Level {bot.level} · rating {bot.rating}</span>
          {beaten && <span className="badge">✓ Sudah dikalahkan</span>}
        </span>
        <span className="block text-muted">{bot.tagline}</span>
        <span className="block text-xs text-muted">Menjawab benar kira-kira {Math.round(bot.accuracy * 100)}% soal</span>
      </span>
    </label>
  );
}
