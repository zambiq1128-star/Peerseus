"use client";
import Link from "next/link";
import { useState } from "react";
import { contributionSummary, courseContributors, POINTS, WINDOW_DAYS, type Contributor } from "@/lib/contributors";
import { Empty, ErrorState, LIST_LIMIT, ShowMoreButton, Spinner, useAsync } from "@/components/ui";

/** Peringkat Kontributor of one course: points from the last 30 days. Top 5, my row pinned below, then "Lihat semua". */
export default function ContributorBoard({ courseId, uid }: { courseId: string; uid: string }) {
  const { data, error, reload } = useAsync(() => courseContributors(courseId), [courseId]);
  const [open, setOpen] = useState(false);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <Spinner />;

  const rule = `Poin ${WINDOW_DAYS} hari terakhir: jawaban terbaik di diskusi materi ${POINTS.bestAnswer} (bukan jawaban untuk pertanyaan sendiri), soal usulan yang diterima ${POINTS.proposal}, materi publik ${POINTS.material}, tiap upvote untuk jawaban ${POINTS.upvote}.`;
  if (data.length === 0) {
    return (
      <div className="space-y-3 animate-page-in">
        <p className="text-xs text-muted">{rule}</p>
        <Empty>Belum ada kontribusi {WINDOW_DAYS} hari terakhir. Upload materi atau jawab diskusi untuk masuk peringkat.</Empty>
      </div>
    );
  }

  const mine = data.findIndex((c) => c.uid === uid);
  const shown = open ? data : data.slice(0, LIST_LIMIT);
  const pinMine = !open && mine >= LIST_LIMIT;
  const row = (c: Contributor, i: number, animate = false) => (
    <tr key={c.uid} className={`border-t border-line ${c.uid === uid ? "bg-accent-soft font-medium" : ""} ${animate ? "animate-row-in" : ""}`}>
      <td className="px-4 py-2 align-top">{i + 1}</td>
      <td className="px-4 py-2">
        <Link href={`/users/${c.uid}`} className="hover:underline">{c.name}</Link>{c.isBot && <span className="text-xs text-muted"> · demo</span>}
        <div className="text-xs font-normal text-muted">{contributionSummary(c)}</div>
      </td>
      <td className="px-4 py-2 text-right align-top font-semibold">{c.points}</td>
    </tr>
  );
  return (
    <div className="space-y-3 animate-page-in">
      <p className="text-xs text-muted">{rule}</p>
      <div className="overflow-x-auto rounded-card border border-line">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs text-muted">
            <tr><th className="px-4 py-2">#</th><th className="px-4 py-2">Nama</th><th className="px-4 py-2 text-right">Poin</th></tr>
          </thead>
          <tbody>
            {shown.map((c, i) => row(c, i, i >= LIST_LIMIT))}
            {pinMine && (
              <>
                <tr aria-hidden className="border-t border-line"><td colSpan={3} className="px-4 py-1 text-center text-muted">…</td></tr>
                {row(data[mine], mine)}
              </>
            )}
          </tbody>
          {data.length > LIST_LIMIT && (
            <tfoot>
              <tr className="border-t border-line"><td colSpan={3} className="p-0"><ShowMoreButton open={open} total={data.length} onClick={() => setOpen(!open)} /></td></tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
