"use client";
/* eslint-disable @next/next/no-img-element -- a small static logo; next/image adds nothing here */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { firebaseEnabled } from "@/lib/firebase";
import { academicOf, academicPatch, FACULTIES, readNim, suggestAcademic, type Academic } from "@/lib/itb";
import { COURSES_PAGE, needsCourses } from "@/lib/peerseus";
import AcademicFields from "./AcademicFields";
import LoginScreen, { loginStyles as ls } from "./Login";
import { Spinner } from "./ui";

const NAV = [
  { href: "/", label: "Mata Kuliah", match: (p: string) => p === "/" || p.startsWith("/courses") || p.startsWith("/materials/") },
  { href: "/duels", label: "Duel", match: (p: string) => p.startsWith("/duel") },
  { href: "/explore", label: "Jelajah", match: (p: string) => p.startsWith("/explore") || p === "/materials" },
];

export function Logo() {
  return <img src="/peerseus-logo.png" alt="Peerseus" width={281} height={253} className="h-9 w-auto brightness-150 drop-shadow-[0_0_8px_rgb(62_240_255/0.35)] sm:h-10" />;
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

/** Top bar on every signed-in page (JRPG menu style): logo, the three main sections, and the profile link. */
function AppHeader({ path, firstName }: { path: string; firstName: string }) {
  const onProfile = path === "/profile";
  return (
    <header className="sticky top-0 z-20 animate-slide-down border-b-2 border-volt bg-navy px-4 text-white">
      <div className="mx-auto flex max-w-page items-center gap-1 py-2.5 sm:gap-4">
        <Link href="/" aria-label="Peerseus, ke beranda" className="animate-slide-left"><Logo /></Link>
        <nav aria-label="Menu utama" className="flex flex-1 gap-1 pl-0.5 sm:gap-1.5 sm:pl-3">
          {NAV.map((n, i) => {
            const active = n.match(path);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                style={{ animationDelay: `${60 + i * 60}ms` }}
                className={`animate-slide-left whitespace-nowrap px-2.5 py-1.5 font-display text-[13px] uppercase tracking-wide transition duration-200 [clip-path:polygon(9px_0,100%_0,calc(100%-9px)_100%,0_100%)] [transition-timing-function:var(--ease-overshoot)] hover:-skew-x-6 hover:translate-x-0.5 focus-visible:bg-white focus-visible:text-navy sm:px-5 sm:text-base sm:tracking-wider ${active ? "bg-volt text-white" : "text-white/80 hover:bg-navy-3 hover:text-cyan"}`}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <Link href="/profile" aria-current={onProfile ? "page" : undefined} title="Profil"
          style={{ animationDelay: "240ms" }}
          className={`animate-slide-right max-w-[4.5rem] truncate px-3 py-1.5 font-display text-[13px] uppercase tracking-wider transition duration-200 [clip-path:polygon(9px_0,100%_0,calc(100%-9px)_100%,0_100%)] [transition-timing-function:var(--ease-overshoot)] hover:-skew-x-6 focus-visible:bg-white focus-visible:text-navy sm:max-w-[10rem] sm:text-sm ${onProfile ? "bg-cyan text-navy" : "bg-navy-3 text-cyan hover:bg-cyan hover:text-navy"}`}>{firstName}</Link>
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

  if (!needsLogin) {
    // Mounted only once signed in (keyed by account), so the name and NIM of that account are known.
    return <LoginScreen><ProfileSetup key={uid ?? "local"} /></LoginScreen>;
  }

  return (
    <LoginScreen>
      <div className={ls.btnWrap}>
        <button className="jrpg-btn-cyan w-full !py-4 !text-xl" disabled={busy} onClick={() => run(signInMicrosoft)}>
          {busy ? "Masuk…" : "Masuk dengan Akun ITB"}
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-muted">Pakai email ITB, mis. nama@mahasiswa.itb.ac.id</p>
      <hr className={ls.divider} />
      <p className="mb-3 text-center text-sm text-ink-soft">Tamu yang sudah didaftarkan?</p>
      <button className="btn-ghost w-full" disabled={busy} onClick={() => run(signInGoogle)}>Masuk dengan Google</button>
      {(err || authError) && <p className="mt-3 text-center text-sm text-bad">{err || authError}</p>}
    </LoginScreen>
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
      <h2 className="font-display text-3xl font-bold uppercase leading-none tracking-tight">Isi profil <span className="text-cyan">pertama kali</span></h2>
      <div>
        <label className="label" htmlFor="nm">Nama</label>
        <input id="nm" className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </div>
      <AcademicFields value={academic} onChange={setAcademic} note={suggestion?.note} />
      <button className="btn-primary w-full !py-3" disabled={busy || !name.trim()}>{busy ? "Menyimpan…" : "Lanjut pilih mata kuliah"}</button>
      {err && <p className="text-sm text-bad">{err}</p>}
    </form>
  );
}
