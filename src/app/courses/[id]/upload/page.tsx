"use client";
import Link from "next/link";
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
          description: "",
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
      <Link href={`/courses/${id}`} className="text-sm text-muted hover:text-ink">← Kembali</Link>
      <PageTitle title="Upload materi" sub="Tempel ringkasan atau lampirkan PDF. Kuis dibuat otomatis dari materi ini." />
      <form onSubmit={submit} className="card mt-2 space-y-4">
        <div><label className="label">Judul</label><input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="mis. Ringkasan Integral Tak Tentu" /></div>
        <div>
          <label className="label">Topik (pisahkan dengan koma)</label>
          <input className="input" required value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="Integral, Substitusi, Parsial" />
        </div>
        <div>
          <label className="label">Isi materi</label>
          <textarea className="input min-h-48 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tempel ringkasan materi di sini…" />
        </div>
        <div>
          <label className="label">Atau lampirkan file (PDF/TXT)</label>
          <input type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={(e) => onFile(e.target.files?.[0] ?? null)} className="text-sm" />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
          <span className="text-muted">Materi ini buatan saya atau boleh dibagikan (bukan buku/soal berhak cipta tanpa izin).</span>
        </label>
        {err && <p className="text-sm text-bad">{err}</p>}
        <button className="btn-primary w-full" disabled={busy || !agree}>{busy ? "Mengunggah…" : "Upload & lanjut buat kuis"}</button>
      </form>
    </div>
  );
}
