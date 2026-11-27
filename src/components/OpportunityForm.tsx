"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { FACULTIES } from "@/lib/itb";
import { OPP_LIMITS, OPP_TYPES, createOpportunity, isHttpsLink, todayString, updateOpportunity, type OpportunityInput } from "@/lib/opportunities";
import type { Opportunity, OpportunityType } from "@/lib/types";

const EMPTY: OpportunityInput = { title: "", type: "lomba", organizer: "", deadline: "", majors: [], link: "", description: "" };

/** "+ Bagikan peluang" (no `existing`) and "Edit" (with `existing`). Only the poster can reach the edit form. */
export default function OpportunityForm({ existing, onSaved, onCancel }: {
  existing?: Opportunity;
  onSaved: (o: Opportunity) => void;
  onCancel: () => void;
}) {
  const { profile } = useAuth();
  const [f, setF] = useState<OpportunityInput>(existing ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (p: Partial<OpportunityInput>) => setF({ ...f, ...p });
  const toggle = (m: string) => set({ majors: f.majors.includes(m) ? f.majors.filter((x) => x !== m) : [...f.majors, m] });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const clean: OpportunityInput = { ...f, title: f.title.trim(), organizer: f.organizer.trim(), link: f.link.trim(), description: f.description.trim() };
    if (!isHttpsLink(clean.link)) return setErr("Link harus diawali https://");
    setBusy(true);
    try {
      if (existing) {
        await updateOpportunity(existing.id, clean);
        onSaved({ ...existing, ...clean, updatedAt: Date.now() });
      } else {
        onSaved(await createOpportunity(clean, profile!.id));
      }
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="card grid gap-3 sm:grid-cols-2" onSubmit={submit}>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="opp-title">Judul</label>
        <input id="opp-title" className="input" required maxLength={OPP_LIMITS.title} value={f.title} onChange={(e) => set({ title: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="opp-type">Jenis</label>
        <select id="opp-type" className="input" value={f.type} onChange={(e) => set({ type: e.target.value as OpportunityType })}>
          {Object.entries(OPP_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {f.type === "lainnya" && <p className="mt-1 text-xs text-muted">Mis. open recruitment, magang, atau acara kampus.</p>}
      </div>
      <div>
        <label className="label" htmlFor="opp-org">Penyelenggara</label>
        <input id="opp-org" className="input" required maxLength={OPP_LIMITS.organizer} value={f.organizer} onChange={(e) => set({ organizer: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="opp-deadline">Deadline</label>
        <input id="opp-deadline" type="date" className="input" required min={existing ? undefined : todayString()} value={f.deadline} onChange={(e) => set({ deadline: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="opp-link">Link</label>
        <input id="opp-link" type="url" className="input" required maxLength={OPP_LIMITS.link} placeholder="https://" value={f.link} onChange={(e) => set({ link: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="opp-desc">Deskripsi</label>
        <textarea id="opp-desc" className="input min-h-32" required maxLength={OPP_LIMITS.description} value={f.description} onChange={(e) => set({ description: e.target.value })} />
        <p className="mt-1 text-xs text-muted">Boleh pakai Markdown, mis. daftar syarat atau tahapan seleksi.</p>
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="label">Fakultas sasaran</legend>
        <div className="flex flex-wrap gap-2">
          {FACULTIES.map((m) => (
            <button key={m} type="button" aria-pressed={f.majors.includes(m)} className={f.majors.includes(m) ? "chip-active" : "chip"} onClick={() => toggle(m)}>{m}</button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">{f.majors.length === 0 ? "Kosong = untuk semua fakultas." : `Untuk ${f.majors.join(", ")}.`}</p>
      </fieldset>
      {err && <p role="alert" className="text-sm text-bad sm:col-span-2">{err}</p>}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button className="btn-primary" disabled={busy}>{busy ? "Menyimpan…" : existing ? "Simpan perubahan" : "Bagikan"}</button>
        <button type="button" className="btn-ghost" onClick={onCancel}>Batal</button>
      </div>
    </form>
  );
}
