"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { firebaseEnabled } from "@/lib/firebase";
import { academicOf, academicPatch, FACULTIES, readNim, suggestAcademic, type Academic } from "@/lib/itb";
import { COURSES_PAGE, needsCourses } from "@/lib/peerseus";
import AcademicFields from "./AcademicFields";
import { Spinner } from "./ui";

const NAV = [
  { href: "/", label: "Mata Kuliah", match: (p: string) => p === "/" || p.startsWith("/courses") || p.startsWith("/materials/") },
  { href: "/duels", label: "Duel", match: (p: string) => p.startsWith("/duel") },
  { href: "/explore", label: "Jelajah", match: (p: string) => p.startsWith("/explore") || p === "/materials" },
];

export function Logo() {
  return <span className="text-lg font-extrabold tracking-tight">Peerseus</span>;
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const { loading, uid, profile } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const redirect = !!profile?.major && needsCourses(profile) && path !== COURSES_PAGE;
  useEffect(() => {
    if (redirect) router.replace(COURSES_PAGE);
  }, [redirect, router]);

  if (loading || redirect) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;
  if (!uid || !profile || !profile.major) return <SignIn />;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader path={path} firstName={profile.name.split(" ")[0]} />
      <main className="flex-1 px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}

/** Top bar on every signed-in page: logo, the three main sections, and the profile link. */
function AppHeader({ path, firstName }: { path: string; firstName: string }) {
  const onProfile = path === "/profile";
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface px-4">
      <div className="mx-auto flex max-w-page items-center gap-2 py-3 sm:gap-4">
        <Link href="/" aria-label="Peerseus, ke beranda"><Logo /></Link>
        <nav aria-label="Menu utama" className="flex flex-1 gap-0.5 sm:gap-1">
          {NAV.map((n) => {
            const active = n.match(path);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-control px-2 py-1.5 text-sm font-medium transition-colors sm:px-2.5 ${active ? "bg-paper text-ink" : "text-muted hover:text-ink"}`}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <Link href="/profile" aria-current={onProfile ? "page" : undefined} title="Profil"
          className={`truncate text-sm font-medium transition-colors ${onProfile ? "text-ink" : "text-muted hover:text-ink"}`}>{firstName}</Link>
      </div>
    </header>
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
  const [academic, setAcademic] = useState<Academic>(() =>
    academicOf(profile, suggestion?.value ?? { faculty: FACULTIES[0], stage: "tpb", program: "" }),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Saving opens the app, which sends a new user on to the Mata Kuliah page.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const fields = { name: name.trim(), ...academicPatch(academic) };
      if (!uid) await signInLocal(fields);
      else await saveProfile({ ...fields, entryYear: profile?.entryYear ?? readNim(authEmail)?.entryYear, year: 1, isPublic: true });
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
      <button className="btn-primary w-full" disabled={busy || !name.trim()}>{busy ? "Menyimpan…" : "Lanjut pilih mata kuliah"}</button>
      {err && <p className="text-sm text-bad">{err}</p>}
    </form>
  );
}
