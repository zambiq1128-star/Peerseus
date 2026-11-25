"use client";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { createMaterial } from "@/lib/peerseus";
import MaterialComposer from "@/components/MaterialComposer";
import AttachmentField, { attachmentToSave, useAttachmentConfig, type AttachmentDraft } from "@/components/AttachmentField";
import { checkAttachment } from "@/lib/attachments";
import { MaterialTypeField, Page, PageHeader, PrivateField } from "@/components/ui";
import type { MaterialType } from "@/lib/types";

export default function Upload() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<MaterialType>("materi");
  const [isPrivate, setIsPrivate] = useState(false);
  const [topics, setTopics] = useState("");
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<AttachmentDraft>(null);
  const attachmentCfg = useAttachmentConfig();
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!text.trim()) return setErr("Isi materi masih kosong. Upload file atau tempel teks dulu.");
    setBusy(true);
    try {
      const file = await attachmentToSave(attachment, isPrivate);
      const m = await createMaterial({
        courseId: id,
        title: title.trim(),
        type,
        isPublic: !isPrivate,
        description: "",
        topics: topics.split(",").map((t) => t.trim()).filter(Boolean),
        text: text.trim(),
        format: "markdown",
        attachment: file,
        uploaderId: profile!.id,
        uploaderName: profile!.name,
      });
      router.push(`/materials/${m.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Page width="wide">
      <PageHeader
        back={{ href: `/courses/${id}`, label: "Kembali" }}
        title="Upload materi"
        sub="Upload PDF, file .tex/.md/.txt, atau tempel teks. Cek hasilnya di editor, lalu simpan. Kuis dibuat dari materi ini."
      />
      <form onSubmit={submit} className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-[2fr_2fr_1fr]">
          <div><label className="label">Judul</label><input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="mis. Tutorial Fisika Dasar: Vektor" /></div>
          <div>
            <label className="label">Topik (pisahkan dengan koma)</label>
            <input className="input" required value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="Vektor, Kinematika, Gaya" />
          </div>
          <MaterialTypeField value={type} onChange={setType} />
        </div>
        <MaterialComposer
          value={text}
          onChange={setText}
          keepsPdf={!!attachmentCfg?.enabled && !isPrivate}
          // A PDF read into the editor is also offered as the attachment, unless one is already picked.
          onPdf={(f) => { if (!attachment && !isPrivate && attachmentCfg?.enabled && !checkAttachment(f, attachmentCfg.maxBytes)) setAttachment({ kind: "new", file: f }); }}
        />
        <AttachmentField value={attachment} onChange={setAttachment} isPrivate={isPrivate} config={attachmentCfg} />
        <PrivateField checked={isPrivate} onChange={setIsPrivate} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
          <span className="text-muted">Materi ini buatan saya atau boleh dibagikan (bukan buku/soal berhak cipta tanpa izin).</span>
        </label>
        {err && <p className="text-sm text-bad">{err}</p>}
        <button className="btn-primary w-full" disabled={busy || !agree}>{busy ? (attachment?.kind === "new" && !isPrivate ? "Mengupload lampiran…" : "Menyimpan…") : "Simpan & lanjut buat kuis"}</button>
      </form>
    </Page>
  );
}
