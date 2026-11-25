"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getMaterial, materialType, setMaterialPublic, updateMaterial } from "@/lib/peerseus";
import type { MaterialType } from "@/lib/types";
import MaterialComposer from "@/components/MaterialComposer";
import AttachmentField, { attachmentToSave, cleanUpAttachment, draftOf, useAttachmentConfig, type AttachmentDraft } from "@/components/AttachmentField";
import { ErrorState, MaterialTypeField, NotFound, Page, PageHeader, PrivateField, Spinner, useAsync } from "@/components/ui";

export default function EditMaterial() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const router = useRouter();
  const { data: material, error, reload } = useAsync(() => getMaterial(id), [id]);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<MaterialType>("materi");
  const [isPrivate, setIsPrivate] = useState(false);
  const [topics, setTopics] = useState("");
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<AttachmentDraft>(null);
  const attachmentCfg = useAttachmentConfig();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!material) return;
    setTitle(material.title);
    setType(materialType(material));
    setIsPrivate(material.isPublic === false);
    setTopics(material.topics.join(", "));
    setText(material.text);
    setAttachment(draftOf(material.attachment));
  }, [material]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (material === undefined) return <Spinner />;
  if (!material) return <NotFound title="Materi tidak ditemukan" />;
  if (material.uploaderId !== profile!.id) return <NotFound title="Tidak bisa mengedit materi ini" back={{ href: `/materials/${id}`, label: "Lihat materi" }}>Hanya pengunggah yang bisa mengedit materi ini.</NotFound>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!text.trim()) return setErr("Isi materi tidak boleh kosong.");
    setBusy(true);
    try {
      // Team Drive files never go into privateMaterials (they are readable by anyone with the link), and own-Drive links never go public.
      const file = await attachmentToSave(attachment, isPrivate);
      const m = await setMaterialPublic({ ...material!, attachment: file }, !isPrivate);
      await updateMaterial(m, { title: title.trim(), type, topics: topics.split(",").map((t) => t.trim()).filter(Boolean), text: text.trim(), attachment: file });
      await cleanUpAttachment(material!.attachment, file);
      router.push(`/materials/${id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Page width="wide">
      <PageHeader
        back={{ href: `/materials/${id}`, label: "Kembali" }}
        title="Edit materi"
        sub="Perbaiki teks dan rumus, rapikan dengan AI, atau ganti isinya dari file baru."
      />
      <form onSubmit={save} className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-[2fr_2fr_1fr]">
          <div><label className="label">Judul</label><input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><label className="label">Topik (pisahkan dengan koma)</label><input className="input" required value={topics} onChange={(e) => setTopics(e.target.value)} /></div>
          <MaterialTypeField value={type} onChange={setType} />
        </div>
        <MaterialComposer value={text} onChange={setText} />
        <AttachmentField value={attachment} onChange={setAttachment} isPrivate={isPrivate} config={attachmentCfg} />
        <PrivateField checked={isPrivate} onChange={setIsPrivate} />
        <p className="text-xs text-muted">Kuis yang sudah ada tidak berubah otomatis setelah materi diedit.</p>
        {err && <p className="text-sm text-bad">{err}</p>}
        <div className="flex justify-end gap-2">
          <Link href={`/materials/${id}`} className="btn-ghost">Batal</Link>
          <button className="btn-primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan perubahan"}</button>
        </div>
      </form>
    </Page>
  );
}
