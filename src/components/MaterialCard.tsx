"use client";
import Link from "next/link";
import { useState } from "react";
import { MATERIAL_TYPES, materialType } from "@/lib/peerseus";
import type { Material } from "@/lib/types";
import { ShowMoreButton, timeAgo } from "./ui";

/** A topic chip is cut after this many characters; old data with very long topics stays tidy. */
export const TOPIC_CHIP_CHARS = 24;
/** Chips shown on a card; the rest becomes "+N". */
export const TOPIC_CHIPS = 3;

const clip = (t: string) => (t.length > TOPIC_CHIP_CHARS ? `${t.slice(0, TOPIC_CHIP_CHARS).trimEnd()}…` : t);

/**
 * The one material card (Jelajah, Materiku, a course's materials, home).
 * Top: course code + type. Then title, topic chips, short description (full only), and a bottom row with
 * uploader, time, file icon, discussion count and the quiz badge. The bottom row sticks to the card's end, so
 * cards in one grid row share a height. `compact` drops the description and the frame (for the home list).
 */
export default function MaterialCard({ m, course, discussions = 0, quizSize, variant = "full", action }: {
  m: Material;
  course?: { code: string; name: string };
  discussions?: number;
  /** Questions of the published quiz; leave out when there is none. */
  quizSize?: number;
  variant?: "full" | "compact";
  /** Extra control at the end of the bottom row (Materiku: "Edit"). */
  action?: React.ReactNode;
}) {
  const full = variant === "full";
  const type = materialType(m);
  const topics = m.topics.filter(Boolean);
  const hidden = topics.length - TOPIC_CHIPS;
  const description = m.description?.trim();
  return (
    <article className={`flex h-full min-w-0 flex-col ${full ? "card" : "p-4"}`}>
      <div className="flex flex-nowrap items-center justify-between gap-2">
        <span className="eyebrow max-w-[60%] shrink-0 truncate whitespace-nowrap" title={course ? `${course.code} ${course.name}` : m.courseId}>{course?.code ?? m.courseId}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {m.isPublic === false && <span className="badge">Privat</span>}
          <span className={type === "paper" ? "badge-accent whitespace-nowrap" : "badge whitespace-nowrap"}>{MATERIAL_TYPES[type]}</span>
        </span>
      </div>
      <Link href={`/materials/${m.id}`} title={m.title} className="mt-2 line-clamp-2 break-words font-semibold hover:underline">{m.title}</Link>
      {topics.length > 0 && (
        <ul aria-label="Topik" className="mt-2 flex flex-wrap gap-1.5">
          {topics.slice(0, TOPIC_CHIPS).map((t, i) => (
            <li key={`${t}-${i}`} title={t.length > TOPIC_CHIP_CHARS ? t : undefined} className="max-w-full break-all border border-line px-2 py-0.5 text-xs text-ink-soft">{clip(t)}</li>
          ))}
          {hidden > 0 && <li className="px-1 py-0.5 text-xs text-muted" title={topics.slice(TOPIC_CHIPS).join(", ")}>+{hidden}</li>}
        </ul>
      )}
      {full && description && <p className="mt-2 line-clamp-2 break-words text-sm text-ink-soft">{description}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-3 text-xs text-muted">
        {/* Name, time and diskusi count stay on one line; only the name is shortened (with "…") when it is too long. */}
        <span className="flex min-w-0 max-w-full items-center gap-x-2">
          <Link href={`/users/${m.uploaderId}`} title={m.uploaderName} className="min-w-0 truncate hover:text-ink hover:underline">{m.uploaderName}</Link>
          <span aria-hidden>·</span>
          <span className="whitespace-nowrap">{timeAgo(m.createdAt)}</span>
          {discussions > 0 && <><span aria-hidden>·</span><span className="whitespace-nowrap">{discussions} diskusi</span></>}
        </span>
        {m.attachment && (
          <svg role="img" aria-label="Ada file asli" viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <title>Ada file asli</title>
            <path d="m21 11-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9" />
          </svg>
        )}
        {quizSize !== undefined && <span className="badge-accent ml-auto whitespace-nowrap">Kuis · {quizSize} soal</span>}
        {action}
      </div>
    </article>
  );
}

/** Cards in a two-column grid, `limit` first and the rest behind "Lihat semua (N)". */
export function MaterialGrid<T>({ items, limit = 6, children }: { items: T[]; limit?: number; children: (item: T) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, limit);
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map(children)}
      </div>
      {items.length > limit && <ShowMoreButton open={open} total={items.length} onClick={() => setOpen(!open)} />}
    </div>
  );
}
