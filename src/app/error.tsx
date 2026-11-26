"use client";
import { DarkRoom } from "@/components/ui";

/** Shown when a page crashes while rendering; the top bar stays so the user can move on. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <DarkRoom title="Terjadi kesalahan di halaman ini" action={<button type="button" className="btn-ghost" onClick={reset}>Coba lagi</button>}>
      Coba muat ulang. Kalau masih terjadi, kembali ke beranda.
      {error.message && <span className="mt-2 block break-words text-xs">{error.message}</span>}
    </DarkRoom>
  );
}
