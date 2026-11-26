"use client";
import { useEffect, useState } from "react";
import {
  ATTACHMENT_ACCEPT, attachmentConfig, checkAttachment, deleteAttachment, driveIdFromLink, formatSize, openUrl, ownDriveAttachment, previewUrl,
  uploadAttachment, type AttachmentConfig,
} from "@/lib/attachments";
import type { Attachment } from "@/lib/types";

/** What the form holds: the saved attachment (or a pasted own-Drive link), a file picked but not uploaded yet, or nothing. */
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

const isOwnLink = (d: AttachmentDraft) => d?.kind === "saved" && !!d.attachment.ownDrive;

/**
 * Turns the draft into what is saved on the material, uploading a new file first.
 * Private materials keep only a link to the uploader's own Drive (team Drive files are readable by anyone
 * with the link); public materials keep only team Drive files (a private Drive link wouldn't open for others).
 */
export async function attachmentToSave(draft: AttachmentDraft, isPrivate: boolean): Promise<Attachment | null> {
  if (!draft) return null;
  if (draft.kind === "saved" && draft.attachment.ownDrive) return isPrivate ? draft.attachment : null;
  if (isPrivate) return null;
  return draft.kind === "saved" ? draft.attachment : uploadAttachment(draft.file);
}

/** After the material is saved: deletes the old team Drive file when it was removed or replaced. */
export async function cleanUpAttachment(before: Attachment | null | undefined, after: Attachment | null) {
  if (before && !before.ownDrive && before.driveFileId !== after?.driveFileId) await deleteAttachment(before);
}

export default function AttachmentField({ value, onChange, isPrivate, config }: {
  value: AttachmentDraft;
  onChange: (d: AttachmentDraft) => void;
  isPrivate: boolean;
  config: AttachmentConfig | null;
}) {
  if (isPrivate) return <OwnDriveLink value={value} onChange={onChange} />;
  if (!config?.enabled) return null;
  return <TeamDriveFile value={value} onChange={onChange} config={config} />;
}

/** Public materials: upload a PDF or image to the team's Drive. */
function TeamDriveFile({ value, onChange, config }: { value: AttachmentDraft; onChange: (d: AttachmentDraft) => void; config: AttachmentConfig }) {
  const [note, setNote] = useState("");
  const own = isOwnLink(value);
  const file = own ? null : value;
  const name = file?.kind === "saved" ? file.attachment.name : file?.file.name;
  const size = file?.kind === "saved" ? file.attachment.size : file?.file.size;
  const link = file?.kind === "saved" ? openUrl(file.attachment) : null;

  function pick(f: File | null) {
    setNote("");
    if (!f) return;
    const problem = checkAttachment(f, config.maxBytes);
    if (problem) return setNote(problem);
    onChange({ kind: "new", file: f });
  }

  return (
    <div className="rounded-card border border-line p-4">
      <div className="label">Lampiran file asli (opsional)</div>
      {own && <p className="mb-2 text-xs text-warn-ink">Link Google Drive pribadi hanya untuk materi privat, jadi akan dilepas saat disimpan.</p>}
      {file ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="truncate font-medium">{name}</span>
          <span className="text-xs text-muted">{formatSize(size ?? 0)}{file.kind === "new" && " · diupload saat disimpan"}</span>
          {link && <a href={link} target="_blank" rel="noreferrer" className="link text-xs">Buka</a>}
          <button type="button" className="ml-auto text-xs text-bad" onClick={() => onChange(null)}>Hapus lampiran</button>
        </div>
      ) : (
        <input type="file" accept={ATTACHMENT_ACCEPT} onChange={(e) => { pick(e.target.files?.[0] ?? null); e.target.value = ""; }} className="text-sm" />
      )}
      <p className="mt-1 text-xs text-muted">
        PDF atau gambar, maksimal {formatSize(config.maxBytes)}. Disimpan di Google Drive Peerseus dan tampil di halaman materi, jadi teman bisa membaca file aslinya.
      </p>
      {note && <p className="mt-1 text-xs text-bad">{note}</p>}
    </div>
  );
}

/** Private materials: a link to a file in the uploader's own Google Drive, kept "Restricted". */
function OwnDriveLink({ value, onChange }: { value: AttachmentDraft; onChange: (d: AttachmentDraft) => void }) {
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const own = isOwnLink(value) && value?.kind === "saved" ? value.attachment : null;
  const link = own ? openUrl(own) : null;

  function use() {
    const id = driveIdFromLink(text);
    if (!id) return setNote("Link belum dikenali. Salin link dari Google Drive (Bagikan → Salin link), mis. https://drive.google.com/file/d/…/view.");
    setNote("");
    setText("");
    onChange({ kind: "saved", attachment: ownDriveAttachment(id) });
  }

  return (
    <div className="rounded-card border border-line p-4">
      <label className="label" htmlFor="own-drive">Link file di Google Drive-mu (opsional)</label>
      {value && !own && <p className="mb-2 text-xs text-warn-ink">Materi privat tidak menyimpan file ke Drive Peerseus, jadi lampiran tadi akan dilepas saat disimpan. Pakai link Drive-mu sendiri di sini.</p>}
      {own && link ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">File di Google Drive-mu</span>
          <a href={link} target="_blank" rel="noreferrer" className="link text-xs">Buka</a>
          <button type="button" className="ml-auto text-xs text-bad" onClick={() => onChange(null)}>Hapus link</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            id="own-drive"
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); use(); } }}
            placeholder="https://drive.google.com/file/d/…/view"
            inputMode="url"
          />
          <button type="button" className="btn-ghost shrink-0" disabled={!text.trim()} onClick={use}>Pakai link</button>
        </div>
      )}
      <p className="mt-1 text-xs text-muted">
        Upload file ke Google Drive-mu sendiri, lalu tempel link-nya di sini. Biarkan akses umumnya <b>Dibatasi (Restricted)</b>, jangan
        &quot;Siapa saja yang memiliki link&quot;, supaya hanya kamu yang bisa membukanya.
      </p>
      {note && <p className="mt-1 text-xs text-bad">{note}</p>}
    </div>
  );
}

/** The attachment on the material page: an embedded Drive preview, or a button for a private own-Drive link. */
export function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  const link = openUrl(attachment);
  if (!link) return null;
  if (attachment.ownDrive) {
    // A Restricted file only opens for its owner signed in to Google; an embed would often show an error, so link out.
    return (
      <section className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold">File di Google Drive-mu</div>
          <div className="text-xs text-muted">Hanya bisa dibuka akun Google pemiliknya (akses Dibatasi).</div>
        </div>
        <a href={link} target="_blank" rel="noreferrer" className="btn-primary">Buka di Google Drive</a>
      </section>
    );
  }
  const src = previewUrl(attachment);
  if (!src) return null;
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
        className={`w-full max-w-full [touch-action:pan-y] rounded-control border border-line bg-paper ${isPdf ? "h-[75vh]" : "h-[60vh]"}`}
        loading="lazy"
      />
    </section>
  );
}
