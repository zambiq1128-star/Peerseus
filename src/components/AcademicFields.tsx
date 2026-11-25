"use client";
import { FACULTIES, PROGRAMS, type Academic, type Stage } from "@/lib/itb";

const STAGES: { id: Stage; label: string }[] = [
  { id: "tpb", label: "Masih TPB" },
  { id: "jurusan", label: "Sudah di jurusan" },
];

/** Faculty, TPB or not, and the (dream) program. Used on the first-run form and the profile page. */
export default function AcademicFields({ value, onChange, note }: { value: Academic; onChange: (v: Academic) => void; note?: string }) {
  const programs = PROGRAMS[value.faculty] ?? [];
  // Keep a program that isn't in the list (e.g. saved before the list changed) selectable.
  const options = value.program && !programs.includes(value.program) ? [value.program, ...programs] : programs;
  const tpb = value.stage === "tpb";

  return (
    <>
      <div>
        <label className="label" htmlFor="fac">Fakultas / Sekolah</label>
        <select
          id="fac"
          className="input"
          value={value.faculty}
          onChange={(e) => {
            const faculty = e.target.value;
            onChange({ ...value, faculty, program: PROGRAMS[faculty]?.includes(value.program) ? value.program : "" });
          }}
        >
          {FACULTIES.map((f) => <option key={f}>{f}</option>)}
        </select>
      </div>
      <div>
        <div className="grid grid-cols-2 gap-1 rounded-control bg-paper p-1" role="group" aria-label="Tahap studi">
          {STAGES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={value.stage === s.id}
              className={`rounded-md px-2 py-1.5 text-sm font-medium ${value.stage === s.id ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
              onClick={() => onChange({ ...value, stage: s.id })}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="prog">{tpb ? "Jurusan impian" : "Jurusan"}</label>
        <select id="prog" className="input" value={value.program} onChange={(e) => onChange({ ...value, program: e.target.value })}>
          <option value="">{tpb ? "Belum tahu" : "Pilih nanti"}</option>
          {options.map((p) => <option key={p}>{p}</option>)}
        </select>
        {tpb && <p className="mt-1 text-xs text-muted">Bisa diganti kapan saja di Profil.</p>}
      </div>
      {note && <p className="text-xs text-muted">{note}</p>}
    </>
  );
}
