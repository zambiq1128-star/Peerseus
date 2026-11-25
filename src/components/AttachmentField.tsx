"use client";
import { useEffect, useState } from "react";
import { ATTACHMENT_ACCEPT, attachmentConfig, checkAttachment, deleteAttachment, formatSize, openUrl, previewUrl, uploadAttachment, type AttachmentConfig } from "@/lib/attachments";
import type { Attachment } from "@/lib/types";

/** What the form holds: the saved attachment, a file picked but not uploaded yet, or nothing. */
export type AttachmentDraft = { kind: "saved"; attachment: Attachment } | { kind: "new"; file: File } | null;

export const draftOf = (a: Attachment | null | undefined): AttachmentDraft => (a ? { kind: "saved", attachment: a } : null);

/** Server config, or null while loading. */
export function useAttachmentConfig(): AttachmentConfig | null {
  const [cfg, setCfg] = useState<AttachmentConfig | null>(null);
  useEffect(() => {
    let live = true;
    void attachmentConfig().then((c) => live && setCfg(c));
    return () => {
      live = false;
    };
  }, []);
  return cfg;
}

/**
 * Turns the draft into what is saved on the material, uploading a new file first.
 * Private materials never keep an attachment: Drive files are readable by anyone with the link.
 */
export async function attachmentToSave(draft: AttachmentDraft, isPrivate: boolean): Promise<Attachment | null> {
  if (isPrivate || !draft) return null;
  return draft.kind === "saved" ? draft.attachment : uploadAttachment(draft.file);
}

/** After the material is saved: deletes the old file from Drive when it was removed or replaced. */
export async function cleanUpAttachment(before: Attachment | null | undefined, after: Attachment | null) {
  if (before && before.driveFileId !== after?.driveFileId) await deleteAttachment(before);
}

export default function AttachmentField({ value, onChange, isPrivate, config }: {
  value: AttachmentDraft;
  onChange: (d: AttachmentDraft) => void;
  isPrivate: boolean;
  config: AttachmentConfig | null;
}) {
  const [note, setNote] = useState("");
  if (!config?.enabled) return null;

  const name = value?.kind === "saved" ? value.attachment.name : value?.file.name;
  const size = value?.kind === "saved" ? value.attachment.size : value?.file.size;
  const link = value?.kind === "saved" ? openUrl(value.attachment) : null;

  function pick(f: File | null) {
    setNote("");
    if (!f) return;
    const problem = checkAttachment(f, config!.maxBytes);
    if (problem) return setNote(problem);
    onChange({ kind: "new", file: f });
  }

  return (
    <div className="rounded-card border border-line p-4">
      <div className="label">Lampiran file asli (opsional)</div>
      {isPrivate ? (
        <p className="text-xs text-muted">
          Materi privat tidak bisa punya lampiran, karena file di Google Drive bisa dibuka siapa pun yang punya link-nya.
          {value && " Lampiran yang ada akan dihapus saat disimpan."}
        </p>
      ) : (
        <>
          {value ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="truncate font-medium">{name}</span>
              <span className="text-xs text-muted">{formatSize(size ?? 0)}{value.kind === "new" && " · diupload saat disimpan"}</span>
              {link && <a href={link} target="_blank" rel="noreferrer" className="link text-xs">Buka</a>}
              <button type="button" className="ml-auto text-xs text-bad" onClick={() => onChange(null)}>Hapus lampiran</button>
            </div>
          ) : (
            <input type="file" accept={ATTACHMENT_ACCEPT} onChange={(e) => { pick(e.target.files?.[0] ?? null); e.target.value = ""; }} className="text-sm" />
          )}
          <p className="mt-1 text-xs text-muted">
            PDF atau gambar, maksimal {formatSize(config.maxBytes)}. Disimpan di Google Drive Peerseus dan tampil di halaman materi, jadi teman bisa membaca file aslinya.
          </p>
        </>
      )}
      {note && <p className="mt-1 text-xs text-bad">{note}</p>}
    </div>
  );
}

/** The attachment on the material page: an embedded Drive preview plus a link to open it. */
export function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  const src = previewUrl(attachment);
  const link = openUrl(attachment);
  if (!src || !link) return null;
  const isPdf = attachment.mimeType === "application/pdf";
  return (
    <section className="card space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="truncate font-medium">{attachment.name}</span>
        <a href={link} target="_blank" rel="noreferrer" className="link text-xs">Buka di Google Drive</a>
      </div>
      <iframe
        src={src}
        title={attachment.name}
        className={`w-full rounded-control border border-line bg-paper ${isPdf ? "h-[75vh]" : "h-[60vh]"}`}
        loading="lazy"
      />
    </section>
  );
}
