"use client";
import { useEffect, useState } from "react";
export const MAJORS = ["STEI", "FTI", "FMIPA", "SITH", "FTSL", "FTTM", "FITB", "FTMD", "SAPPK", "SBM", "FSRD"];

export function Spinner({ label = "Memuat…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
      {label}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">{children}</div>;
}

export function PageTitle({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function TopicBar({ topic, correct, total }: { topic: string; correct: number; total: number }) {
  const p = total ? Math.round((correct / total) * 100) : 0;
  const color = p >= 75 ? "bg-sea" : p >= 50 ? "bg-gold" : "bg-red-500";
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
