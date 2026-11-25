"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FACULTIES } from "@/lib/itb";
import { MATERIAL_TYPES } from "@/lib/peerseus";
import type { MaterialType } from "@/lib/types";

/** Faculty/school codes (the profile's `major` field). */
export const MAJORS = FACULTIES;

export function Spinner({ label = "Memuat…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-card border border-dashed border-line p-6 text-center text-sm text-muted">{children}</div>;
}

const WIDTHS = { narrow: "max-w-narrow", page: "max-w-page", wide: "max-w-wide" } as const;

/**
 * Every route renders one Page: a centered column with a fixed width step and the same vertical rhythm.
 * narrow = forms and focused screens, page = default, wide = editor + preview.
 */
export function Page({ width = "page", children }: { width?: keyof typeof WIDTHS; children: React.ReactNode }) {
  return <div className={`mx-auto w-full space-y-6 ${WIDTHS[width]}`}>{children}</div>;
}

/** Top of every page: optional back link, small label above the title, title, description and actions. */
export function PageHeader({ title, sub, eyebrow, back, action }: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  eyebrow?: React.ReactNode;
  back?: { href: string; label: string };
  action?: React.ReactNode;
}) {
  return (
    <header>
      {back && <Link href={back.href} className="text-sm text-muted hover:text-ink">← {back.label}</Link>}
      <div className={`flex flex-wrap items-end justify-between gap-3 ${back ? "mt-2" : ""}`}>
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
        </div>
        {action && <div className="flex flex-wrap gap-2">{action}</div>}
      </div>
    </header>
  );
}

/** A titled block inside a page. */
export function Section({ title, action, children }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="section-title">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Jenis materi on the upload and edit forms. */
export function MaterialTypeField({ value, onChange }: { value: MaterialType; onChange: (t: MaterialType) => void }) {
  return (
    <div>
      <label className="label" htmlFor="mtype">Jenis</label>
      <select id="mtype" className="input" value={value} onChange={(e) => onChange(e.target.value as MaterialType)}>
        {Object.entries(MATERIAL_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  );
}

/** "Only me" switch on the upload and edit forms (Materiku). */
export function PrivateField({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1" />
      <span>
        Privat, hanya untuk saya
        <span className="block text-xs text-muted">Tersimpan di Materiku dan tidak terlihat orang lain. Kuis dan duel hanya bisa dari materi publik.</span>
      </span>
    </label>
  );
}

export function TopicBar({ topic, correct, total }: { topic: string; correct: number; total: number }) {
  const p = total ? Math.round((correct / total) * 100) : 0;
  const color = p >= 75 ? "bg-good" : p >= 50 ? "bg-warn" : "bg-bad";
  return (
    <div>
      <div className="flex justify-between text-xs"><span className="font-medium">{topic}</span><span className="text-muted">{correct}/{total} · {p}%</span></div>
      <div className="mt-1 h-2 rounded-full bg-paper"><div className={`h-2 rounded-full ${color}`} style={{ width: `${p}%` }} /></div>
    </div>
  );
}

export function timeAgo(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  // tiny helper: re-runs fn when deps change; returns [data, reload]
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string>("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setError("");
    fn().then((d) => alive && setData(d)).catch((e) => alive && setError(String(e?.message ?? e)));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, reload: () => setTick((t) => t + 1) };
}

/** "ITB" for a verified ITB account, "Tamu" for a listed guest; nothing for demo users and local mode. */
export function AccountBadge({ itb, className = "" }: { itb?: boolean; className?: string }) {
  if (itb === undefined) return null;
  return itb ? (
    <span className={`badge-accent ${className}`} title="Masuk dengan akun Microsoft ITB">✓ ITB</span>
  ) : (
    <span className={`badge ${className}`} title="Tamu yang didaftarkan tim, bukan akun ITB">Tamu</span>
  );
}
