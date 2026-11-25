"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { db, newId } from "@/lib/db";
import type { Opportunity, OpportunityType } from "@/lib/types";
import { Empty, MAJORS, Page, PageHeader, Spinner, useAsync } from "@/components/ui";

const TYPES: Record<OpportunityType, string> = { beasiswa: "Beasiswa", lomba: "Lomba", seminar: "Seminar", lainnya: "Lainnya" };
const daysLeft = (d: string) => Math.ceil((new Date(d + "T23:59:59").getTime() - Date.now()) / 86400000);

export default function Opportunities() {
  const { profile } = useAuth();
  const { data, reload } = useAsync(() => db.list<Opportunity>("opportunities"), []);
  const [type, setType] = useState<"" | OpportunityType>("");
  const [major, setMajor] = useState(profile!.major);
  const [within, setWithin] = useState(0);
  const [adding, setAdding] = useState(false);

  if (!data) return <Spinner />;
  const list = data
    .filter((o) => daysLeft(o.deadline) >= 0)
    .filter((o) => !type || o.type === type)
    .filter((o) => !major || o.majors.length === 0 || o.majors.includes(major))
    .filter((o) => !within || daysLeft(o.deadline) <= within)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));

  return (
    <Page>
      <PageHeader title="Info akademik" sub="Beasiswa, lomba, seminar, dan info lainnya dalam satu tempat." action={<button className="btn-ghost" onClick={() => setAdding(!adding)}>{adding ? "Tutup" : "+ Bagikan info"}</button>} />
      {adding && <AddForm onDone={() => { setAdding(false); reload(); }} />}
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <select className="input !w-auto" value={type} onChange={(e) => setType(e.target.value as OpportunityType | "")}>
            <option value="">Semua jenis</option>
            {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="input !w-auto" value={major} onChange={(e) => setMajor(e.target.value)}>
            <option value="">Semua fakultas</option>
            {MAJORS.map((m) => <option key={m}>{m}</option>)}
          </select>
          <select className="input !w-auto" value={within} onChange={(e) => setWithin(+e.target.value)}>
            <option value={0}>Deadline kapan saja</option>
            <option value={7}>≤ 7 hari lagi</option>
            <option value={14}>≤ 14 hari lagi</option>
            <option value={30}>≤ 30 hari lagi</option>
          </select>
        </div>
        {list.length === 0 && <Empty>Tidak ada info yang cocok dengan filter.</Empty>}
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((o) => {
            const d = daysLeft(o.deadline);
            return (
              <div key={o.id} className="card flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <span className="eyebrow">{TYPES[o.type] ?? TYPES.lainnya}</span>
                  <span className={d <= 7 ? "badge-bad" : "badge"}>{d === 0 ? "Hari ini" : `${d} hari lagi`}</span>
                </div>
                <div className="mt-1 font-semibold">{o.title}</div>
                <div className="text-xs text-muted">{o.organizer} · deadline {new Date(o.deadline).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</div>
                <p className="mt-2 flex-1 text-sm">{o.description}</p>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex flex-wrap gap-1">{(o.majors.length ? o.majors : ["Semua fakultas"]).map((m) => <span key={m} className="badge">{m}</span>)}</div>
                  <a href={o.link} target="_blank" rel="noreferrer" className="link text-sm">Detail →</a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-muted">Info bertanda “(contoh)” adalah data contoh untuk demo.</p>
    </Page>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const { profile } = useAuth();
  const [f, setF] = useState({ title: "", type: "lomba" as OpportunityType, organizer: "", deadline: "", link: "", description: "", majors: [] as string[] });
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  return (
    <form
      className="card grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const id = newId("opp_");
        await db.set("opportunities", id, { ...f, id, postedBy: profile!.id, createdAt: Date.now() } satisfies Opportunity);
        onDone();
      }}
    >
      <div className="sm:col-span-2"><label className="label">Judul</label><input className="input" required value={f.title} onChange={(e) => set({ title: e.target.value })} /></div>
      <div><label className="label" htmlFor="opp-type">Jenis</label><select id="opp-type" className="input" value={f.type} onChange={(e) => set({ type: e.target.value as OpportunityType })}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>{f.type === "lainnya" && <p className="mt-1 text-xs text-muted">Mis. open recruitment, magang, atau acara kampus.</p>}</div>
      <div><label className="label">Penyelenggara</label><input className="input" required value={f.organizer} onChange={(e) => set({ organizer: e.target.value })} /></div>
      <div><label className="label">Deadline</label><input type="date" className="input" required value={f.deadline} onChange={(e) => set({ deadline: e.target.value })} /></div>
      <div><label className="label">Link</label><input type="url" className="input" required value={f.link} onChange={(e) => set({ link: e.target.value })} placeholder="https://" /></div>
      <div className="sm:col-span-2"><label className="label">Deskripsi</label><textarea className="input" value={f.description} onChange={(e) => set({ description: e.target.value })} /></div>
      <div className="sm:col-span-2">
        <label className="label">Untuk fakultas (kosongkan = semua)</label>
        <div className="flex flex-wrap gap-2">
          {MAJORS.map((m) => (
            <label key={m} className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={f.majors.includes(m)} onChange={(e) => set({ majors: e.target.checked ? [...f.majors, m] : f.majors.filter((x) => x !== m) })} />{m}
            </label>
          ))}
        </div>
      </div>
      <button className="btn-primary sm:col-span-2">Bagikan</button>
    </form>
  );
}
