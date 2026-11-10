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
  const [count, setCount] = useState(8);
  const [reported, setReported] = useState("");

  if (!data) return <Spinner />;
  const { material, quiz } = data;
  if (!material) return <Empty>Materi tidak ditemukan.</Empty>;
  const isUploader = material.uploaderId === uid;

  async function gen() {
    setBusy(true);
    setErr("");
    try {
      await generateQuiz(material!, uid, count);
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
        <Link href={`/courses/${material.courseId}`} className="text-sm text-sea">← Kembali ke mata kuliah</Link>
        <h1 className="mt-2 text-2xl font-extrabold">{material.title}</h1>
        <p className="text-sm text-muted">oleh {material.uploaderName} · {timeAgo(material.createdAt)}</p>
        <div className="mt-2 flex flex-wrap gap-1">{material.topics.map((t) => <span key={t} className="badge bg-white ring-1 ring-line">{t}</span>)}</div>
      </div>

      <section className="card">
        {material.description && <p className="mb-3 text-sm">{material.description}</p>}
        {material.fileUrl && (
          <a href={material.fileUrl} target="_blank" rel="noreferrer" download={material.fileName} className="btn-ghost mb-3">📎 {material.fileName}</a>
        )}
        {material.text && (
          <>
            <pre className={`whitespace-pre-wrap font-sans text-sm leading-relaxed ${showText ? "" : "line-clamp-5"}`}>{material.text}</pre>
            <button className="mt-2 text-sm font-semibold text-sea" onClick={() => setShowText(!showText)}>{showText ? "Tutup" : "Baca selengkapnya"}</button>
          </>
        )}
        <div className="mt-4 border-t border-line pt-3 text-right">
          <button className="text-xs text-muted underline" onClick={() => report("materi")} disabled={reported === "materi"}>
            {reported === "materi" ? "Terima kasih, laporan dikirim" : "Laporkan materi (hak cipta / tidak pantas)"}
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Kuis</h2>
        {!quiz && (
          isUploader ? (
            <div className="card space-y-3">
              <p className="text-sm">Buat soal pilihan ganda dari materi ini dengan Gemini. Kamu akan mengulas soalnya dulu sebelum dipublikasikan.</p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm">Jumlah soal</label>
                <select className="input !w-24" value={count} onChange={(e) => setCount(+e.target.value)}>{[5, 8, 10, 12].map((n) => <option key={n}>{n}</option>)}</select>
                <button className="btn-gold" onClick={gen} disabled={busy}>{busy ? "✨ Membuat soal…" : "✨ Buat kuis dengan AI"}</button>
              </div>
              {err && <p className="text-sm text-red-600">{err}</p>}
            </div>
          ) : (
            <Empty>Pengunggah belum membuat kuis untuk materi ini.</Empty>
          )
        )}

        {quiz?.status === "draft" && (isUploader ? <Review quiz={quiz} onDone={reload} onRegen={gen} busy={busy} /> : <Empty>Kuis sedang diulas oleh pengunggah.</Empty>)}

        {quiz?.status === "published" && (
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-bold">{quiz.questions.length} soal siap diduelkan</div>
                <div className="text-xs text-muted">
                  {quiz.generator === "gemini" ? "Dibuat dengan Gemini" : quiz.generator === "fallback" ? "Dibuat offline" : "Contoh"} · diulas oleh pengunggah
                </div>
              </div>
              <Link href={`/duel/new?quiz=${quiz.id}`} className="btn-gold">⚔️ Tantang teman</Link>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {Array.from(new Set(quiz.questions.map((q) => q.topic))).map((t) => (
                <span key={t} className="badge bg-paper">{t} · {quiz.questions.filter((q) => q.topic === t).length}</span>
              ))}
            </div>
            <div className="mt-4 border-t border-line pt-3 text-right">
              <button className="text-xs text-muted underline" onClick={() => report("kuis")} disabled={reported === "kuis"}>
                {reported === "kuis" ? "Terima kasih, laporan dikirim" : "Laporkan soal yang salah"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Review({ quiz, onDone, onRegen, busy }: { quiz: Quiz; onDone: () => void; onRegen: () => void; busy: boolean }) {
  const [qs, setQs] = useState<Question[]>(quiz.questions);
  const [saving, setSaving] = useState(false);
  const set = (i: number, patch: Partial<Question>) => setQs(qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  async function save(publish: boolean) {
    setSaving(true);
    await db.update("quizzes", quiz.id, { questions: qs, status: publish ? "published" : "draft" });
    setSaving(false);
    onDone();
  }

  return (
    <div className="space-y-4">
      <div className="card border-gold bg-gold-soft text-sm">
        <b>Ulas dulu sebelum publikasi.</b> AI bisa salah. Periksa kunci jawaban, perbaiki kalimat, atau hapus soal yang kurang tepat.
        <span className="ml-1 text-muted">({quiz.generator === "gemini" ? "Gemini" : "generator offline, karena GEMINI_API_KEY belum diatur"})</span>
      </div>
      {qs.map((q, i) => (
        <div key={q.id} className="card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-muted">Soal {i + 1}</span>
            <div className="flex items-center gap-2">
              <input className="input !w-40 !py-1 text-xs" value={q.topic} onChange={(e) => set(i, { topic: e.target.value })} aria-label="Topik" />
              <button className="text-xs text-red-600" onClick={() => setQs(qs.filter((_, j) => j !== i))}>Hapus</button>
            </div>
          </div>
          <textarea className="input" value={q.question} onChange={(e) => set(i, { question: e.target.value })} />
          <div className="grid gap-2 sm:grid-cols-2">
            {q.options.map((o, k) => (
              <label key={k} className={`flex items-center gap-2 rounded-xl border p-2 ${q.answerIndex === k ? "border-sea bg-sea/5" : "border-line"}`}>
                <input type="radio" name={`ans-${q.id}`} checked={q.answerIndex === k} onChange={() => set(i, { answerIndex: k })} />
                <input className="w-full bg-transparent text-sm outline-none" value={o} onChange={(e) => set(i, { options: q.options.map((x, z) => (z === k ? e.target.value : x)) })} />
              </label>
            ))}
          </div>
          <input className="input text-xs" value={q.explanation} onChange={(e) => set(i, { explanation: e.target.value })} placeholder="Penjelasan" />
        </div>
      ))}
      <div className="sticky bottom-4 flex flex-wrap justify-end gap-2 rounded-2xl bg-white/90 p-3 ring-1 ring-line backdrop-blur">
        <button className="btn-ghost" onClick={onRegen} disabled={busy || saving}>{busy ? "Membuat ulang…" : "Buat ulang"}</button>
        <button className="btn-ghost" onClick={() => save(false)} disabled={saving}>Simpan draf</button>
        <button className="btn-primary" onClick={() => save(true)} disabled={saving || qs.length < 3}>Publikasikan {qs.length} soal</button>
      </div>
    </div>
  );
}
