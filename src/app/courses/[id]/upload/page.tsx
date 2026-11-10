"use client";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { createMaterial } from "@/lib/peerseus";
import { PageTitle } from "@/components/ui";

export default function Upload() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [topics, setTopics] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onFile(f: File | null) {
    setFile(f);
    if (f && (f.type.startsWith("text/") || /\.(md|txt)$/i.test(f.name))) setText(await f.text());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!text.trim() && !file) return setErr("Isi ringkasan teks atau lampirkan file.");
    setBusy(true);
    try {
      const isTextFile = file && (file.type.startsWith("text/") || /\.(md|txt)$/i.test(file.name));
      const m = await createMaterial(
        {
          courseId: id,
          title: title.trim(),
          description: description.trim(),
          topics: topics.split(",").map((t) => t.trim()).filter(Boolean),
          text: text.trim(),
          uploaderId: profile!.id,
          uploaderName: profile!.name,
        },
        isTextFile ? undefined : file ?? undefined,
      );
      router.push(`/materials/${m.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Upload materi" sub="Bagikan ringkasan atau catatan. Kuis akan dibuat dari materi ini." />
      <form onSubmit={submit} className="card space-y-4">
        <div><label className="label">Judul</label><input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="mis. Ringkasan Integral Tak Tentu" /></div>
        <div><label className="label">Deskripsi singkat</label><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Bab berapa, untuk persiapan apa" /></div>
        <div>
          <label className="label">Topik (pisahkan dengan koma)</label>
          <input className="input" required value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="Integral, Substitusi, Parsial" />
          <p className="mt-1 text-xs text-muted">Topik dipakai untuk memberi label soal dan melihat topik mana yang kamu lewatkan saat duel.</p>
        </div>
        <div>
          <label className="label">Isi materi / ringkasan</label>
          <textarea className="input min-h-48 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tempel ringkasan materi di sini…" />
        </div>
        <div>
          <label className="label">Atau lampirkan file (PDF, TXT, MD)</label>
          <input type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={(e) => onFile(e.target.files?.[0] ?? null)} className="text-sm" />
          <p className="mt-1 text-xs text-muted">PDF dibaca langsung oleh Gemini saat membuat kuis.</p>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
          <span>Materi ini buatan saya sendiri atau boleh dibagikan. Saya tidak mengunggah buku/soal berhak cipta tanpa izin. Materi yang dilaporkan melanggar akan diturunkan.</span>
        </label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn-primary w-full" disabled={busy || !agree}>{busy ? "Mengunggah…" : "Upload"}</button>
      </form>
    </div>
  );
}
