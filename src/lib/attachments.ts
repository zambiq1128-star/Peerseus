"use client";
import { authHeaders } from "./convert";
import type { Attachment } from "./types";

/**
 * Browser side of material attachments (server: src/app/api/attachments, src/lib/drive.ts).
 * The file goes straight from the browser to the team's Google Drive; our server only opens
 * the upload and then shares the finished file by link.
 */

export const ATTACHMENT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp";
const TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

export type AttachmentConfig = { enabled: boolean; maxBytes: number };
let config: Promise<AttachmentConfig> | null = null;

/** Whether the server has Google Drive set up. Asked once per page load. */
export function attachmentConfig(): Promise<AttachmentConfig> {
  config ??= fetch("/api/attachments")
    .then((r) => r.json() as Promise<AttachmentConfig>)
    .catch(() => {
      config = null;
      return { enabled: false, maxBytes: 0 };
    });
  return config;
}

/** Type from the file, or from its extension when the browser leaves it empty. */
export function attachmentType(f: File): string {
  if (TYPES.includes(f.type)) return f.type;
  const ext = /\.([a-z]+)$/i.exec(f.name)?.[1]?.toLowerCase();
  return ({ pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" } as Record<string, string>)[ext ?? ""] ?? "";
}

/** A message when the file can't be attached, or "" when it can. */
export function checkAttachment(f: File, maxBytes: number): string {
  if (!attachmentType(f)) return "Lampiran harus PDF atau gambar (PNG, JPG, WebP).";
  if (f.size > maxBytes) return `File ini ${formatSize(f.size)}. Maksimal ${formatSize(maxBytes)}.`;
  return "";
}

export function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${+(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function post<T>(body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/attachments", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Koneksi terputus. Periksa internet lalu coba lagi.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Gagal menyimpan lampiran (HTTP ${res.status}).`);
  return data;
}

/** Uploads the file to the team's Drive and returns it as an attachment, readable by anyone with the link. */
export async function uploadAttachment(file: File): Promise<Attachment> {
  const mimeType = attachmentType(file);
  const { uploadUrl, uploadKey } = await post<{ uploadUrl: string; uploadKey: string }>({ action: "start", name: file.name, mimeType, size: file.size });
  let res: Response;
  try {
    res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: file });
  } catch {
    throw new Error("Upload ke Google Drive terputus. Periksa internet lalu coba lagi.");
  }
  if (!res.ok) throw new Error(`Google Drive menolak upload (HTTP ${res.status}). Coba lagi.`);
  return post<Attachment>({ action: "finish", uploadKey });
}

/** Deletes an attachment I uploaded. Best effort: a failure only leaves an unused file in the Drive folder. */
export async function deleteAttachment(a: Attachment): Promise<void> {
  await post({ action: "delete", driveFileId: a.driveFileId }).catch((e) => console.warn("[attachments] delete failed:", (e as Error).message));
}

/** Drive ids are letters, digits, - and _. Anything else is not put in a URL. */
const validId = (id: string) => /^[A-Za-z0-9_-]{10,200}$/.test(id);
export const previewUrl = (a: Attachment) => (validId(a.driveFileId) ? `https://drive.google.com/file/d/${a.driveFileId}/preview` : null);
/** open?id= works for files, Google Docs/Sheets/Slides and folders alike. */
export const openUrl = (a: Attachment) => (validId(a.driveFileId) ? `https://drive.google.com/open?id=${a.driveFileId}` : null);

/**
 * The file id in a Google Drive or Docs link (private materials link to the uploader's own Drive), or null.
 * Accepts drive.google.com/file/d/ID/..., docs.google.com/document|spreadsheets|presentation/d/ID/...,
 * .../folders/ID and ...?id=ID.
 */
export function driveIdFromLink(link: string): string | null {
  let u: URL;
  try {
    u = new URL(link.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !["drive.google.com", "docs.google.com"].includes(u.hostname)) return null;
  const id = /\/d\/([A-Za-z0-9_-]+)/.exec(u.pathname)?.[1] ?? /\/folders\/([A-Za-z0-9_-]+)/.exec(u.pathname)?.[1] ?? u.searchParams.get("id") ?? "";
  return validId(id) ? id : null;
}

/** A pasted own-Drive link as an attachment. */
export const ownDriveAttachment = (driveFileId: string): Attachment => ({ driveFileId, name: "", mimeType: "", size: 0, ownDrive: true });
