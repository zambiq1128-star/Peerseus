"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteMaterial, getMaterial, materialLinks, materialType, MOVE_BLOCKED, setMaterialPublic, updateMaterial } from "@/lib/peerseus";
import type { Course, MaterialType } from "@/lib/types";
import MaterialComposer from "@/components/MaterialComposer";
import AttachmentField, { attachmentToSave, cleanUpAttachment, draftOf, useAttachmentConfig, type AttachmentDraft } from "@/components/AttachmentField";
import { ErrorState, MaterialTypeField, NotFound, Page, PageHeader, PrivateField, Section, Spinner, useAsync } from "@/components/ui";

export default function EditMaterial() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const router = useRouter();
  const { data: material, error, reload } = useAsync(() => getMaterial(id), [id]);
  // My courses for "Mata kuliah", and whether a quiz or discussions keep the material where it is.
  const { data: extra } = useAsync(async () => {
    if (!material) return null;
    const [courses, links] = await Promise.all([db.list<Course>("courses"), materialLinks(material)]);
    const ids = new Set([...profile!.courseIds, material.courseId]);
    return { courses: courses.filter((c) => ids.has(c.id)).sort((a, b) => a.code.localeCompare(b.code)), links };
  }, [material, profile?.courseIds.length]);
  const [courseId, setCourseId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delErr, setDelErr] = useState("");
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
    setCourseId(material.courseId);
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

  const canMove = !!extra && !extra.links.hasQuiz && extra.links.discussions === 0;

  async function remove() {
    setDeleting(true);
    setDelErr("");
    try {
      await deleteMaterial(material!);
      router.replace(`/courses/${material!.courseId}?dihapus=1`);
    } catch (e) {
      setDelErr((e as Error).message);
      setDeleting(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!text.trim()) return setErr("Isi materi tidak boleh kosong.");
    setBusy(true);
    try {
      // Team Drive files never go into privateMaterials (they are readable by anyone with the link), and own-Drive links never go public.
      const file = await attachmentToSave(attachment, isPrivate);
      const m = await setMaterialPublic({ ...material!, attachment: file }, !isPrivate);
      const move = courseId && courseId !== material!.courseId && canMove ? { courseId } : {};
      await updateMaterial(m, { title: title.trim(), type, topics: topics.split(",").map((t) => t.trim()).filter(Boolean), text: text.trim(), attachment: file, ...move });
      await cleanUpAttachment(material!.attachment, file);
      // replace: the edit page leaves the history, so "Kembali" on the material goes to where the user came from.
      router.replace(`/materials/${id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Page width="wide">
      <PageHeader
        back={{ href: `/materials/${id}`, label: "Kembali", history: true }}
        title="Edit materi"
        sub="Perbaiki teks dan rumus, rapikan dengan AI, atau ganti isinya dari file baru."
      />
      <form onSubmit={save} className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-[2fr_2fr_1fr]">
          <div><label className="label">Judul</label><input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><label className="label">Topik (pisahkan dengan koma)</label><input className="input" required value={topics} onChange={(e) => setTopics(e.target.value)} /></div>
          <MaterialTypeField value={type} onChange={setType} />
        </div>
        <div className="sm:max-w-md">
          <label className="label" htmlFor="mata-kuliah">Mata kuliah</label>
          <select id="mata-kuliah" className="input disabled:cursor-not-allowed disabled:opacity-60" value={courseId} disabled={!canMove} aria-describedby="mata-kuliah-info" onChange={(e) => setCourseId(e.target.value)}>
            {(extra?.courses ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
            {!extra && <option value={courseId}>Memuat…</option>}
          </select>
          <p id="mata-kuliah-info" className="mt-1 text-xs text-muted">
            {!extra ? "Memeriksa kuis dan diskusi…" : canMove ? "Pilih dari mata kuliah yang kamu ikuti." : `${MOVE_BLOCKED}.`}
          </p>
        </div>
        <MaterialComposer value={text} onChange={setText} />
        <AttachmentField value={attachment} onChange={setAttachment} isPrivate={isPrivate} config={attachmentCfg} />
        <PrivateField checked={isPrivate} onChange={setIsPrivate} />
        <p className="text-xs text-muted">Kuis yang sudah ada tidak berubah otomatis setelah materi diedit.</p>
        {err && <p className="text-sm text-bad">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => router.replace(`/materials/${id}`)}>Batal</button>
          <button className="btn-primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan perubahan"}</button>
        </div>
      </form>

      <Section title="Zona berbahaya">
        <div className="card space-y-3">
          <p className="text-sm text-muted">Menghapus materi tidak bisa dibatalkan.</p>
          {!confirming ? (
            <button type="button" className="btn-ghost" onClick={() => { setConfirming(true); setDelErr(""); }}>Hapus materi</button>
          ) : (
            <div role="alertdialog" aria-labelledby="hapus-judul" className="space-y-3 border-[3px] border-bad p-4">
              <p id="hapus-judul" className="font-semibold">Hapus “{material.title}”?</p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                <li>Yang ikut dihapus: materi ini{extra?.links.hasQuiz ? " dan kuisnya" : ""}.</li>
                {material.isPublic !== false && (
                  <li>{!extra ? "Diskusi di materi ini tidak akan tampil lagi." : extra.links.discussions ? `${extra.links.discussions} diskusi di materi ini tidak akan tampil lagi.` : "Belum ada diskusi di materi ini."}</li>
                )}
                <li>Riwayat duel tetap tersimpan.</li>
                <li>File lampiran di Google Drive tidak ikut terhapus. Hapus sendiri di Drive kalau perlu.</li>
              </ul>
              {delErr && <p role="alert" className="text-sm text-bad">{delErr}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="btn-ghost" disabled={deleting} onClick={() => setConfirming(false)}>Batal</button>
                <button type="button" className="btn-bad" disabled={deleting || !extra} onClick={remove}>{deleting ? "Menghapus…" : "Hapus permanen"}</button>
              </div>
            </div>
          )}
        </div>
      </Section>
    </Page>
  );
}
