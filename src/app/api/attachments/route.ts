import { ATTACHMENT_TYPES, deleteUpload, driveEnabled, DriveError, finishUpload, MAX_ATTACHMENT_BYTES, startUpload } from "@/lib/drive";
import { checkAllowedUser } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body =
  | { action: "start"; name?: string; mimeType?: string; size?: number }
  | { action: "finish"; uploadKey?: string }
  | { action: "delete"; driveFileId?: string };

/** Whether attachments are on (the Google Drive env vars are set), and the limits the browser checks first. */
export async function GET() {
  return Response.json({ enabled: driveEnabled(), maxBytes: MAX_ATTACHMENT_BYTES, types: ATTACHMENT_TYPES });
}

const bad = (error: string, status = 400) => Response.json({ error, code: "bad_request" }, { status });

export async function POST(req: Request) {
  const check = await checkAllowedUser(req);
  if (check.denied) return check.denied;
  if (!driveEnabled()) return Response.json({ error: "Lampiran file belum diaktifkan di server.", code: "disabled" }, { status: 503 });
  const uid = check.user?.uid ?? "demo";

  let b: Body;
  try {
    b = (await req.json()) as Body;
  } catch {
    return bad("Permintaan tidak valid.");
  }
  try {
    if (b.action === "start") {
      const size = Number(b.size);
      if (!ATTACHMENT_TYPES.includes(b.mimeType ?? "")) return bad("File harus PDF atau gambar (PNG, JPG, WebP).");
      if (!Number.isInteger(size) || size <= 0 || size > MAX_ATTACHMENT_BYTES) return bad("Ukuran file maksimal 10 MB.");
      const name = (b.name ?? "").trim() || "lampiran";
      return Response.json(await startUpload({ name, mimeType: b.mimeType!, size, uid, origin: req.headers.get("origin") ?? new URL(req.url).origin }));
    }
    if (b.action === "finish") return Response.json(await finishUpload(b.uploadKey ?? "", uid));
    if (b.action === "delete") {
      await deleteUpload(b.driveFileId ?? "", uid);
      return Response.json({ ok: true });
    }
    return bad("Aksi tidak dikenal.");
  } catch (e) {
    if (e instanceof DriveError) return Response.json({ error: e.message, code: "drive" }, { status: e.status });
    console.error("[attachments]", (e as Error).message);
    return Response.json({ error: "Gagal menghubungi Google Drive. Coba lagi sebentar.", code: "drive" }, { status: 502 });
  }
}
