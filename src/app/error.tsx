"use client";
import { ErrorState, Page } from "@/components/ui";

/** Shown when a page crashes while rendering; the top bar stays so the user can move on. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Page width="narrow">
      <ErrorState title="Terjadi kesalahan di halaman ini" hint="Coba muat ulang. Kalau masih terjadi, kembali ke beranda." message={error.message} onRetry={reset} />
    </Page>
  );
}
