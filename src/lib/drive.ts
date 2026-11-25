import { randomBytes } from "node:crypto";

/**
 * Material attachments (PDF or image) in one Google Drive folder owned by the team's Gmail account.
 * Server only. Firebase Storage needs the paid Blaze plan, and a service account has no Drive quota of its
 * own, so the server acts as the team account with an OAuth refresh token (docs/SETUP.md, "Lampiran file").
 *
 * Upload flow (Vercel rejects request bodies over 4.5 MB, so the file never passes through Vercel):
 * 1. the server opens a resumable upload session in the folder and hands its URL to the browser;
 * 2. the browser sends the file straight to that URL;
 * 3. the server finds the file by the random upload key from step 1, checks it, and makes it readable by link.
 *
 * Scope `drive.file`: the app only sees files and folders it created itself, never the rest of the team's Drive.
 */

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const FOLDER_NAME = "Peerseus Lampiran";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

export class DriveError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

function env() {
  const e = process.env;
  const clientId = e.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const clientSecret = e.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  const refreshToken = e.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
  return clientId && clientSecret && refreshToken ? { clientId, clientSecret, refreshToken, folderId: e.GOOGLE_DRIVE_FOLDER_ID?.trim() || "" } : null;
}

export const driveEnabled = () => env() !== null;

let token: { value: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && Date.now() < token.expires) return token.value;
  const cfg = env();
  if (!cfg) throw new DriveError("Lampiran file belum diaktifkan di server.", 503);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: cfg.refreshToken, grant_type: "refresh_token" }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !data.access_token) {
    // invalid_grant = the refresh token was revoked or expired (e.g. the OAuth app is still in "Testing").
    console.error("[drive] token refresh failed:", res.status, data.error);
    throw new DriveError("Server gagal masuk ke Google Drive tim. Cek GOOGLE_DRIVE_REFRESH_TOKEN.", 503);
  }
  token = { value: data.access_token, expires: Date.now() + ((data.expires_in ?? 3600) - 120) * 1000 };
  return token.value;
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(init.body ? { "Content-Type": "application/json; charset=UTF-8" } : {}), ...init.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    console.error("[drive]", init.method ?? "GET", url.split("?")[0], res.status, (await res.text()).slice(0, 300));
    throw new DriveError("Google Drive menolak permintaan. Coba lagi sebentar.");
  }
  return (res.status === 204 ? {} : await res.json()) as T;
}

const q = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

let folderCache = "";

/** GOOGLE_DRIVE_FOLDER_ID, or the "Peerseus Lampiran" folder this app made (created on first use). */
async function folderId(): Promise<string> {
  const fixed = env()?.folderId;
  if (fixed) return fixed;
  if (folderCache) return folderCache;
  const mime = "application/vnd.google-apps.folder";
  const found = await call<{ files: { id: string }[] }>(
    `${API}/files?${new URLSearchParams({ q: `name = ${q(FOLDER_NAME)} and mimeType = ${q(mime)} and trashed = false`, fields: "files(id)", pageSize: "1" })}`,
  );
  folderCache = found.files[0]?.id ?? (await call<{ id: string }>(`${API}/files?fields=id`, { method: "POST", body: JSON.stringify({ name: FOLDER_NAME, mimeType: mime }) })).id;
  return folderCache;
}

export type UploadSession = { uploadUrl: string; uploadKey: string };

/** Opens a resumable upload in the folder. The URL itself grants the upload, so only its requester gets it. */
export async function startUpload(f: { name: string; mimeType: string; size: number; uid: string; origin: string | null }): Promise<UploadSession> {
  const uploadKey = randomBytes(16).toString("hex");
  const res = await fetch(`${UPLOAD_API}/files?uploadType=resumable&fields=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": f.mimeType,
      "X-Upload-Content-Length": String(f.size),
      // Lets the browser on this origin send the file to the session URL (CORS).
      ...(f.origin ? { Origin: f.origin } : {}),
    },
    body: JSON.stringify({
      name: f.name.slice(0, 200),
      mimeType: f.mimeType,
      parents: [await folderId()],
      appProperties: { uploadKey, uploaderUid: f.uid },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const uploadUrl = res.headers.get("location");
  if (!res.ok || !uploadUrl) {
    console.error("[drive] start upload", res.status, (await res.text()).slice(0, 300));
    throw new DriveError("Gagal menyiapkan upload ke Google Drive.");
  }
  return { uploadUrl, uploadKey };
}

type DriveFile = { id: string; name: string; mimeType: string; size?: string; appProperties?: Record<string, string> };

export type DriveAttachment = { driveFileId: string; name: string; mimeType: string; size: number };

async function byKey(uploadKey: string): Promise<DriveFile | undefined> {
  if (!/^[0-9a-f]{32}$/.test(uploadKey)) return undefined;
  const res = await call<{ files: DriveFile[] }>(
    `${API}/files?${new URLSearchParams({
      q: `appProperties has { key='uploadKey' and value=${q(uploadKey)} } and ${q(await folderId())} in parents and trashed = false`,
      fields: "files(id,name,mimeType,size,appProperties)",
      pageSize: "1",
    })}`,
  );
  return res.files[0];
}

/**
 * Checks the uploaded file (uploader, type, size) and shares it as "anyone with the link can view".
 * A file that breaks the limits is deleted.
 */
export async function finishUpload(uploadKey: string, uid: string): Promise<DriveAttachment> {
  const f = await byKey(uploadKey);
  if (!f || f.appProperties?.uploaderUid !== uid) throw new DriveError("File yang diupload tidak ditemukan. Coba upload lagi.", 404);
  const size = Number(f.size ?? 0);
  if (!ATTACHMENT_TYPES.includes(f.mimeType) || !size || size > MAX_ATTACHMENT_BYTES) {
    await call(`${API}/files/${encodeURIComponent(f.id)}`, { method: "DELETE" }).catch(() => {});
    throw new DriveError("File harus PDF atau gambar (PNG, JPG, WebP), maksimal 10 MB.", 400);
  }
  await call(`${API}/files/${encodeURIComponent(f.id)}/permissions?fields=id`, { method: "POST", body: JSON.stringify({ role: "reader", type: "anyone" }) });
  return { driveFileId: f.id, name: f.name, mimeType: f.mimeType, size };
}

/** Deletes an attachment, only when the same user uploaded it. Missing files count as deleted. */
export async function deleteUpload(driveFileId: string, uid: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(driveFileId)) throw new DriveError("Id file tidak valid.", 400);
  const res = await fetch(`${API}/files/${encodeURIComponent(driveFileId)}?fields=appProperties`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) return;
  if (!res.ok) throw new DriveError("Gagal memeriksa file di Google Drive.");
  const f = (await res.json()) as Pick<DriveFile, "appProperties">;
  if (f.appProperties?.uploaderUid !== uid) throw new DriveError("Hanya pengunggah yang bisa menghapus file ini.", 403);
  await call(`${API}/files/${encodeURIComponent(driveFileId)}`, { method: "DELETE" });
}
