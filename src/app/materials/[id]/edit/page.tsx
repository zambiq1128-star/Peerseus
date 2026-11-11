"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateMaterial } from "@/lib/peerseus";
import type { Material } from "@/lib/types";
import MaterialComposer from "@/components/MaterialComposer";
import { Empty, PageTitle, Spinner, useAsync } from "@/components/ui";

export default function EditMaterial() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const router = useRouter();
  const { data: material } = useAsync(() => db.get<Material>("materials", id), [id]);
  const [title, setTitle] = useState("");
  const [topics, setTopics] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!material) return;
    setTitle(material.title);
    setTopics(material.topics.join(", "));
    setText(material.text);
  }, [material]);

  if (material === undefined) return <Spinner />;
  if (!material) return <Empty>Materi tidak ditemukan.</Empty>;
  if (material.uploaderId !== profile!.id) return <Empty>Hanya pengunggah yang bisa mengedit materi ini.</Empty>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!text.trim()) return setErr("Isi materi tidak boleh kosong.");
    setBusy(true);
    try {
      await updateMaterial(id, { title: title.trim(), topics: topics.split(",").map((t) => t.trim()).filter(Boolean), text: text.trim() });
      router.push(`/materials/${id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/materials/${id}`} className="text-sm text-muted hover:text-ink">← Kembali</Link>
      <PageTitle title="Edit materi" sub="Perbaiki teks dan rumus, rapikan dengan AI, atau ganti isinya dari file baru." />
      <form onSubmit={save} className="card mt-2 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Judul</label><input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><label className="label">Topik (pisahkan dengan koma)</label><input className="input" required value={topics} onChange={(e) => setTopics(e.target.value)} /></div>
        </div>
        <MaterialComposer value={text} onChange={setText} />
        <p className="text-xs text-muted">Kuis yang sudah ada tidak berubah otomatis setelah materi diedit.</p>
        {err && <p className="text-sm text-bad">{err}</p>}
        <div className="flex justify-end gap-2">
          <Link href={`/materials/${id}`} className="btn-ghost">Batal</Link>
          <button className="btn-primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan perubahan"}</button>
        </div>
      </form>
    </div>
  );
}
