"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateQuiz } from "@/lib/peerseus";
import type { Material, Question, Quiz } from "@/lib/types";
import { Empty, Spinner, timeAgo, useAsync } from "@/components/ui";

export default function MaterialPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const uid = profile!.id;
  const { data, reload } = useAsync(async () => {
    const material = await db.get<Material>("materials", id);
    const quiz = await db.get<Quiz>("quizzes", `quiz_${id}`);
    return { material, quiz };
  }, [id]);
  const [showText, setShowText] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [reported, setReported] = useState("");

  if (!data) return <Spinner />;
  const { material, quiz } = data;
  if (!material) return <Empty>Materi tidak ditemukan.</Empty>;
  const isUploader = material.uploaderId === uid;

  async function gen() {
    setBusy(true);
    setErr("");
    try {
      await generateQuiz(material!, uid, 8);
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  async function report(kind: "materi" | "kuis") {
    if (kind === "materi") await db.update("materials", material!.id, { reports: material!.reports + 1 });
    else if (quiz) await db.update("quizzes", quiz.id, { reports: quiz.reports + 1 });
    setReported(kind);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/courses/${material.courseId}`} className="text-sm text-muted hover:text-ink">← Kembali</Link>
        <h1 className="mt-2 text-xl font-bold">{material.title}</h1>
        <p className="text-sm text-muted">{material.topics.join(", ")} · oleh {material.uploaderName} · {timeAgo(material.createdAt)}</p>
      </div>

      {/* Step 1: the quiz (the main action on this page) */}
      {quiz?.status === "published" && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-accent bg-accent-soft">
          <div>
            <div className="font-semibold">Kuis siap: {quiz.questions.length} soal</div>
            <div className="text-xs text-muted">Duel 6 soal acak, 20 detik per soal. Lawan dipilih yang levelnya mirip.</div>
          </div>
          <Link href={`/duel/new?quiz=${quiz.id}`} className="btn-primary">Mulai duel</Link>
        </div>
      )}

      {!quiz && (isUploader ? (
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold">Buat kuis dari materi ini</div>
            <div className="text-xs text-muted">AI membuat 8 soal pilihan ganda. Kamu cek dulu sebelum dipublikasikan.</div>
          </div>
          <button className="btn-primary" onClick={gen} disabled={busy}>{busy ? "Membuat soal…" : "Buat kuis"}</button>
          {err && <p className="w-full text-sm text-bad">{err}</p>}
        </div>
      ) : (
        <Empty>Pengunggah belum membuat kuis untuk materi ini.</Empty>
      ))}

      {quiz?.status === "draft" && (isUploader
        ? <Review key={quiz.createdAt} quiz={quiz} onDone={reload} onRegen={gen} busy={busy} />
        : <Empty>Kuis sedang dicek oleh pengunggah.</Empty>)}

      {/* The material itself */}
      <section className="card">
        {material.fileUrl && (
          <a href={material.fileUrl} target="_blank" rel="noreferrer" download={material.fileName} className="btn-ghost mb-3">Unduh {material.fileName}</a>
        )}
        {material.text && (
          <>
            <pre className={`whitespace-pre-wrap font-sans text-sm leading-relaxed ${showText ? "" : "line-clamp-6"}`}>{material.text}</pre>
            <button className="mt-2 text-sm font-medium text-accent" onClick={() => setShowText(!showText)}>{showText ? "Tutup" : "Baca selengkapnya"}</button>
          </>
        )}
      </section>

      <div className="flex justify-end gap-4 text-xs text-muted">
        <button className="underline" onClick={() => report("materi")} disabled={reported === "materi"}>
          {reported === "materi" ? "Laporan terkirim" : "Laporkan materi"}
        </button>
        {quiz?.status === "published" && (
          <button className="underline" onClick={() => report("kuis")} disabled={reported === "kuis"}>
            {reported === "kuis" ? "Laporan terkirim" : "Laporkan soal salah"}
          </button>
        )}
      </div>
    </div>
  );
}

function Review({ quiz, onDone, onRegen, busy }: { quiz: Quiz; onDone: () => void; onRegen: () => void; busy: boolean }) {
  const [qs, setQs] = useState<Question[]>(quiz.questions);
  const [saving, setSaving] = useState(false);
  const set = (i: number, patch: Partial<Question>) => setQs(qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  async function publish() {
    setSaving(true);
    await db.update("quizzes", quiz.id, { questions: qs, status: "published" });
    setSaving(false);
    onDone();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        <b>Cek soal sebelum dipublikasikan.</b> <span className="text-muted">Pilih jawaban benar, perbaiki kalimat, atau hapus soal yang kurang tepat.
        {quiz.generator === "fallback" && " (Dibuat generator offline karena GEMINI_API_KEY belum diisi.)"}</span>
      </p>
      {qs.map((q, i) => (
        <div key={q.id} className="card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-muted">Soal {i + 1} · {q.topic}</span>
            <button className="text-xs text-bad" onClick={() => setQs(qs.filter((_, j) => j !== i))}>Hapus</button>
          </div>
          <textarea className="input" rows={2} value={q.question} onChange={(e) => set(i, { question: e.target.value })} />
          <div className="grid gap-2 sm:grid-cols-2">
            {q.options.map((o, k) => (
              <label key={k} className={`flex items-center gap-2 rounded-lg border p-2 ${q.answerIndex === k ? "border-good bg-green-50" : "border-line"}`}>
                <input type="radio" name={`ans-${q.id}`} checked={q.answerIndex === k} onChange={() => set(i, { answerIndex: k })} />
                <input className="w-full bg-transparent text-sm outline-none" value={o} onChange={(e) => set(i, { options: q.options.map((x, z) => (z === k ? e.target.value : x)) })} />
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="sticky bottom-4 flex justify-end gap-2 rounded-xl border border-line bg-white p-3">
        <button className="btn-ghost" onClick={onRegen} disabled={busy || saving}>{busy ? "Membuat ulang…" : "Buat ulang"}</button>
        <button className="btn-primary" onClick={publish} disabled={saving || qs.length < 3}>Publikasikan {qs.length} soal</button>
      </div>
    </div>
  );
}
