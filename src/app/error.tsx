"use client";
import { ErrorState, Page } from "@/components/ui";

/** Shown when a page crashes while rendering; the top bar stays so the user can move on. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="world-mono -mx-4 -my-6 min-h-[calc(100dvh-3rem)] sm:min-h-[calc(100dvh-3.6rem)] px-4 py-16 sm:-my-8">
    <Page width="narrow">
      <ErrorState title="Terjadi kesalahan di halaman ini" hint="Coba muat ulang. Kalau masih terjadi, kembali ke beranda." message={error.message} onRetry={reset} />
    </Page>
    </div>
  );
}
