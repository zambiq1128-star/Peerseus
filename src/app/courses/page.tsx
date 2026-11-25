"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { courseInfo, currentSemester, curriculumCourses, curriculumFor, termLabel, type CourseInfo } from "@/lib/curriculum";
import { db } from "@/lib/db";
import { academicLabel, academicOf, academicPatch, readNim, type Academic } from "@/lib/itb";
import { needsCourses, setMyCourses } from "@/lib/peerseus";
import type { Course } from "@/lib/types";
import AcademicFields from "@/components/AcademicFields";
import { Empty, ErrorState, Page, PageHeader, Section, Spinner, useAsync } from "@/components/ui";

const SEMESTERS = Array.from({ length: 14 }, (_, i) => i + 1);
/** ITB course codes: two letters and four characters, e.g. IF2110 or WI201X. */
const CODE = /^[A-Z]{2}\d{3}[0-9X]$/;

/** Courses by code, first list wins. */
function merge(...lists: CourseInfo[][]): CourseInfo[] {
  const seen = new Map<string, CourseInfo>();
  for (const c of lists.flat()) if (!seen.has(c.code)) seen.set(c.code, c);
  return [...seen.values()];
}

/** Picks this semester's courses. Shown right after the personal data for new users, and from the menu later. */
export default function CoursesPage() {
  const { profile } = useAuth();
  const { data: catalog, error, reload } = useAsync(() => db.list<Course>("courses"), []);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!catalog) return <Spinner />;
  return <CourseEditor key={profile!.id} catalog={catalog} />;
}

function CourseEditor({ catalog }: { catalog: Course[] }) {
  const { profile, authEmail, saveProfile } = useAuth();
  const p = profile!;
  const router = useRouter();
  const [firstRun] = useState(() => needsCourses(p));
  const [academic, setAcademic] = useState<Academic>(() => academicOf(p, { faculty: p.major, stage: "tpb", program: "" }));
  const [editAcademic, setEditAcademic] = useState(false);
  /** Courses added from the search box on this visit; they stay when the semester or jurusan changes. */
  const [added, setAdded] = useState<Set<string>>(() => new Set());
  const toInfo = (c: Course): CourseInfo => ({ code: c.code, name: c.name, sks: c.sks ?? courseInfo(c.code)?.sks });

  const [semester, setSemester] = useState<number | null>(() => p.semester ?? currentSemester(academic, readNim(authEmail)?.entryYear ?? null));
  const [picked, setPicked] = useState<CourseInfo[]>(() => {
    const mine = catalog.filter((c) => p.courseIds.includes(c.id)).map(toInfo);
    // First time on this page: start from the curriculum, keeping courses joined before.
    return p.semester === undefined ? merge(curriculumFor(academic, semester), mine) : mine;
  });
  const [q, setQ] = useState("");
  const [manual, setManual] = useState({ code: "", name: "" });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  const all = useMemo(() => merge(catalog.map(toInfo), curriculumCourses()), [catalog]);
  const query = q.trim().toLowerCase();
  const results = query
    ? all.filter((c) => !picked.some((x) => x.code === c.code) && (c.code.toLowerCase().includes(query) || c.name.toLowerCase().includes(query))).slice(0, 8)
    : [];
  const total = picked.reduce((s, c) => s + (c.sks ?? 0), 0);
  const manualCode = manual.code.trim().toUpperCase();
  const canAddManual = CODE.test(manualCode) && !!manual.name.trim() && !picked.some((c) => c.code === manualCode);

  function change(next: CourseInfo[]) {
    setSaved(false);
    setPicked(next);
  }

  /**
   * A new semester or jurusan starts from its own curriculum. Every curriculum course goes, whichever
   * jurusan or semester it came from (the jurusan may have been changed on Profil since the last save);
   * courses added from the search box on this visit, and ones that are in no curriculum, stay.
   */
  function recompute(a: Academic, n: number | null) {
    const keep = picked.filter((c) => added.has(c.code) || !courseInfo(c.code));
    change(merge(curriculumFor(a, n), keep));
  }

  function changeSemester(n: number | null) {
    recompute(academic, n);
    setSemester(n);
  }

  function changeAcademic(a: Academic) {
    recompute(a, semester);
    setAcademic(a);
  }

  function search(value: string) {
    setQ(value);
    const v = value.trim();
    setManual(CODE.test(v.toUpperCase()) ? { code: v.toUpperCase(), name: "" } : { code: "", name: v });
  }

  function add(c: CourseInfo) {
    setAdded(new Set(added).add(c.code));
    change([...picked, c]);
    search("");
  }

  async function save() {
    if (!semester) return;
    setBusy(true);
    setErr("");
    try {
      const patch = academicPatch(academic);
      const courseIds = await setMyCourses({ ...p, ...patch }, picked);
      await saveProfile({ courseIds, semester, ...patch });
      if (firstRun) router.push("/");
      else {
        setSaved(true);
        setBusy(false);
      }
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Page width="narrow">
      <PageHeader
        title="Mata kuliah"
        sub="Mata kuliah ini menentukan materi, lawan duel, dan teman belajarmu di Peerseus."
        back={firstRun ? undefined : { href: "/", label: "Beranda" }}
      />

      <div className="card flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="font-semibold">{academicLabel(academicPatch(academic))}</div>
          <button type="button" className="link text-sm" aria-expanded={editAcademic} onClick={() => setEditAcademic(!editAcademic)}>
            {editAcademic ? "Selesai ubah jurusan" : "Ubah jurusan"}
          </button>
        </div>
        <div>
          <label className="label" htmlFor="sem">Semester <span className="font-normal text-muted">· {termLabel()}</span></label>
          <select id="sem" className="input !w-auto" value={semester ?? ""} onChange={(e) => changeSemester(e.target.value ? Number(e.target.value) : null)}>
            {semester === null && <option value="">Pilih semester</option>}
            {SEMESTERS.map((n) => <option key={n} value={n}>Semester {n}</option>)}
          </select>
        </div>
        {editAcademic && (
          <div className="w-full space-y-4 border-t border-line pt-4">
            <AcademicFields value={academic} onChange={changeAcademic} note="Daftar mata kuliah di bawah ikut berganti. Tersimpan saat kamu menekan Simpan." />
          </div>
        )}
      </div>

      <Section title="Mata kuliah semester ini">
        {picked.length === 0 ? (
          <Empty>
            {semester
              ? "Data kurikulum untuk jurusanmu di semester ini belum ada. Cari dan tambahkan mata kuliahmu di bawah."
              : "Pilih semester dulu, atau langsung cari mata kuliahmu di bawah."}
          </Empty>
        ) : (
          <>
            <ul className="rows">
              {picked.map((c) => (
                <li key={c.code} className="flex items-center gap-3 py-2.5 pl-4 pr-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-muted">{c.code}</div>
                    <div className="font-medium">{c.name}</div>
                  </div>
                  {c.sks ? <span className="shrink-0 text-sm text-muted">{c.sks} SKS</span> : null}
                  <button
                    type="button"
                    aria-label={`Hapus ${c.name}`}
                    className="shrink-0 rounded-control px-2.5 py-1.5 text-muted hover:bg-navy-3 hover:text-bad"
                    onClick={() => change(picked.filter((x) => x.code !== c.code))}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-right text-sm text-muted">Total <b className="text-ink">{total} SKS</b></p>
          </>
        )}
      </Section>

      <section>
        <label className="label" htmlFor="cari">Tambah mata kuliah</label>
        <input id="cari" className="input" value={q} onChange={(e) => search(e.target.value)} placeholder="Cari kode atau nama, mis. IF2110 atau Basis Data" autoComplete="off" />
        <p className="mt-1 text-xs text-muted">Untuk mata kuliah mengulang, pilihan, atau lintas prodi.</p>
        {results.length > 0 && (
          <ul className="rows mt-2">
            {results.map((c) => (
              <li key={c.code} className="flex items-center gap-3 py-2 pl-4 pr-2">
                <div className="min-w-0 flex-1 text-sm"><span className="text-xs font-semibold text-muted">{c.code}</span> {c.name}{c.sks ? <span className="text-muted"> · {c.sks} SKS</span> : null}</div>
                <button type="button" className="btn-ghost shrink-0 !px-3 !py-1.5" onClick={() => add(c)}>Tambah</button>
              </li>
            ))}
          </ul>
        )}
        {query && results.length === 0 && (
          <div className="mt-2 rounded-card border border-dashed border-line p-3">
            <p className="text-sm text-muted">Tidak ketemu. Tambahkan sendiri:</p>
            <div className="mt-2 grid grid-cols-[7rem_1fr] gap-2">
              <input className="input" aria-label="Kode mata kuliah" placeholder="Kode" value={manual.code} onChange={(e) => setManual({ ...manual, code: e.target.value })} />
              <input className="input" aria-label="Nama mata kuliah" placeholder="Nama mata kuliah" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} />
            </div>
            <button type="button" className="btn-ghost mt-2 w-full" disabled={!canAddManual} onClick={() => add({ code: manualCode, name: manual.name.trim() })}>
              Tambah {manualCode || "mata kuliah"}
            </button>
          </div>
        )}
      </section>

      <div>
        <button className="btn-primary w-full" disabled={busy || !semester} onClick={save}>
          {busy ? "Menyimpan…" : firstRun ? "Simpan & mulai" : saved ? "Tersimpan" : "Simpan"}
        </button>
        {!semester && <p className="mt-2 text-center text-xs text-muted">Pilih semester dulu sebelum menyimpan.</p>}
        {err && <p className="mt-2 text-sm text-bad">{err}</p>}
      </div>
    </Page>
  );
}
