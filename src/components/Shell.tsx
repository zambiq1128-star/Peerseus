"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { firebaseEnabled } from "@/lib/firebase";
import { suggestCourses } from "@/lib/curriculum";
import { newId } from "@/lib/db";
import { academicOf, academicPatch, FACULTIES, readNim, suggestAcademic, type Academic } from "@/lib/itb";
import { joinSuggestedCourses } from "@/lib/peerseus";
import AcademicFields from "./AcademicFields";

const NAV = [
  { href: "/", label: "Mata Kuliah", match: (p: string) => p === "/" || p.startsWith("/courses") || p.startsWith("/materials") },
  { href: "/duels", label: "Duel", match: (p: string) => p.startsWith("/duel") },
  { href: "/opportunities", label: "Info", match: (p: string) => p.startsWith("/opportunities") },
];

export function Logo() {
  return <span className="text-lg font-extrabold tracking-tight">Peerseus</span>;
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const { loading, uid, profile } = useAuth();
  const path = usePathname();

  if (loading) return <div className="grid min-h-screen place-items-center text-sm text-muted">Memuat…</div>;
  if (!uid || !profile || !profile.major) return <SignIn />;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-3 sm:gap-4">
          <Link href="/"><Logo /></Link>
          <nav className="flex flex-1 gap-0.5 sm:gap-1">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={`whitespace-nowrap rounded-md px-2 py-1.5 text-sm font-medium sm:px-2.5 ${n.match(path) ? "bg-paper text-ink" : "text-muted hover:text-ink"}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          <Link href="/profile" className={`truncate text-sm font-medium ${path === "/profile" ? "text-ink" : "text-muted hover:text-ink"}`}>{profile.name.split(" ")[0]}</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
    </div>
  );
}

/** One screen: sign in, then fill the profile fields we actually need. */
function SignIn() {
  const { uid, authError, signInMicrosoft, signInGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const needsLogin = firebaseEnabled && !uid;

  function run(signIn: () => Promise<void>) {
    setBusy(true);
    setErr("");
    signIn().catch((e) => setErr(e.message)).finally(() => setBusy(false));
  }

  return (
    <div className="grid min-h-screen place-items-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <Logo />
        <h1 className="mt-6 text-2xl font-bold leading-snug">Belajar bareng teman seangkatan.</h1>
        <p className="mt-2 text-sm text-muted">Buka materi kuliah, latihan lewat duel kuis, lalu temukan teman belajar yang pas.</p>
        <div className="card mt-6">
          {needsLogin ? (
            <>
              <button className="btn-primary w-full" disabled={busy} onClick={() => run(signInMicrosoft)}>
                {busy ? "Masuk…" : "Masuk dengan akun ITB"}
              </button>
              <p className="mt-2 text-center text-xs text-muted">Akun Microsoft ITB, mis. NIM@mahasiswa.itb.ac.id.</p>
              <div className="mt-4 border-t border-line pt-4 text-center text-xs text-muted">
                Tamu yang sudah didaftarkan?{" "}
                <button className="font-medium text-ink underline disabled:opacity-50" disabled={busy} onClick={() => run(signInGoogle)}>
                  Masuk dengan Google
                </button>
              </div>
              {(err || authError) && <p className="mt-3 text-sm text-bad">{err || authError}</p>}
            </>
          ) : (
            // Mounted only once signed in (keyed by account), so the name and NIM of that account are known.
            <ProfileSetup key={uid ?? "local"} />
          )}
        </div>
      </div>
    </div>
  );
}

/** First-run profile: name, faculty and (dream) program, prefilled from the NIM in the ITB email when we can. */
function ProfileSetup() {
  const { uid, authName, authEmail, profile, signInLocal, saveProfile } = useAuth();
  const [name, setName] = useState(profile?.name || authName);
  // Guests, staff and NIM codes not in the list get no suggestion and pick by hand.
  const [suggestion] = useState(() => suggestAcademic(authEmail));
  const [entryYear] = useState(() => readNim(authEmail)?.entryYear ?? null);
  const [academic, setAcademic] = useState<Academic>(() =>
    academicOf(profile, suggestion?.value ?? { faculty: FACULTIES[0], stage: "tpb", program: "" }),
  );
  // This semester's courses (Kurikulum 2024), all ticked; codes the user unticks.
  const courses = suggestCourses(academic, entryYear);
  const [unticked, setUnticked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const fields = { name: name.trim(), ...academicPatch(academic) };
      const id = uid ?? newId("u_");
      // Join courses before saving the profile: saving it opens the app, which lists the joined courses.
      const picked = courses?.courses.filter((c) => !unticked.includes(c.code)) ?? [];
      const joined = await joinSuggestedCourses({ id, name: fields.name, major: fields.major }, picked);
      if (!uid) await signInLocal({ ...fields, id, courseIds: joined });
      else await saveProfile({ ...fields, year: 1, isPublic: true, courseIds: [...new Set([...(profile?.courseIds ?? []), ...joined])] });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="nm">Nama</label>
        <input id="nm" className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </div>
      <AcademicFields value={academic} onChange={setAcademic} note={suggestion?.note} />
      {courses && (
        <fieldset>
          <legend className="label">Mata kuliah semester {courses.semester}</legend>
          <div className="space-y-2 rounded-lg border border-line p-3">
            {courses.courses.map((c) => (
              <label key={c.code} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={!unticked.includes(c.code)}
                  onChange={(e) => setUnticked(e.target.checked ? unticked.filter((x) => x !== c.code) : [...unticked, c.code])}
                />
                <span><span className="text-xs text-muted">{c.code}</span> {c.name}</span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">Dari Kurikulum ITB 2024. Hapus centang yang tidak kamu ambil.</p>
        </fieldset>
      )}
      <button className="btn-primary w-full" disabled={busy || !name.trim()}>{busy ? "Masuk…" : "Mulai"}</button>
      {err && <p className="text-sm text-bad">{err}</p>}
    </form>
  );
}
