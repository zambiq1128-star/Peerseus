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
  return <img src="/peerseus-logo.png" alt="Peerseus" width={281} height={253} className="h-9 w-auto brightness-150 drop-shadow-[2px_2px_0_#0a0a0a] sm:h-10" />;
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

/** Top bar on every signed-in page (manga style): ink-black bar with a gradient strip, active section = tilted yellow panel. */
function AppHeader({ path, firstName }: { path: string; firstName: string }) {
  const onProfile = path === "/profile";
  const item = "animate-impact whitespace-nowrap border-[3px] px-2.5 py-1 font-display text-base uppercase tracking-wide transition duration-200 [font-synthesis:none] [transition-timing-function:var(--ease-overshoot)] hover:scale-105 hover:-rotate-2 focus-visible:outline-white sm:px-5 sm:text-xl";
  return (
    <header className="sticky top-0 z-20 animate-slide-down bg-navy px-4 pb-2 text-white">
      <div className="mx-auto flex max-w-page items-center gap-1 py-2.5 sm:gap-4">
        <Link href="/" aria-label="Peerseus, ke beranda" className="animate-impact"><Logo /></Link>
        <nav aria-label="Menu utama" className="flex flex-1 gap-1.5 pl-0.5 sm:gap-2 sm:pl-3">
          {NAV.map((n, i) => {
            const active = n.match(path);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                style={{ animationDelay: `${60 + i * 70}ms` }}
                className={`${item} ${active ? "-rotate-2 -skew-x-6 border-ink-black bg-yellow text-ink-black shadow-[3px_3px_0_#ff2e88]" : "border-transparent text-white hover:border-ink-black hover:bg-navy-3 hover:text-yellow"}`}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <Link href="/profile" aria-current={onProfile ? "page" : undefined} title="Profil"
          style={{ animationDelay: "280ms" }}
          className={`${item} max-w-[4.5rem] truncate sm:max-w-[10rem] ${onProfile ? "-rotate-2 border-ink-black bg-yellow text-ink-black shadow-[3px_3px_0_#ff2e88]" : "border-ink-black bg-teal text-ink-black hover:bg-yellow"}`}>{firstName}</Link>
      </div>
      {/* Gradient strip along the bottom edge. */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-2 border-y-2 border-ink-black bg-[linear-gradient(90deg,#ff2e88,#ffd400,#00c2b8)]" />
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
