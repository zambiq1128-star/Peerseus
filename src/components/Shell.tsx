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
import InviteBanner from "./DuelInvites";
import LoginScreen, { loginStyles as ls } from "./Login";
import { Spinner } from "./ui";

const NAV = [
  { href: "/", label: "Mata Kuliah", match: (p: string) => p === "/" || p.startsWith("/courses") || p.startsWith("/materials/") },
  { href: "/duels", label: "Duel", match: (p: string) => p.startsWith("/duel") },
  { href: "/explore", label: "Jelajah", match: (p: string) => p.startsWith("/explore") || p === "/materials" || p.startsWith("/opportunities") },
];

export function Logo() {
  return <img src="/peerseus-logo.png" alt="Peerseus" width={281} height={253} className="h-9 w-auto brightness-0 invert sm:h-10" />;
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const { loading, uid, profile, logout } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const redirect = !!profile?.major && needsCourses(profile) && path !== COURSES_PAGE;
  useEffect(() => {
    if (redirect) router.replace(COURSES_PAGE);
  }, [redirect, router]);

  if (loading || redirect) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;
  if (!uid || !profile || !profile.major) return <SignIn />;

  // Setup not finished (courses not saved yet): no menu, no profile link, no duel invites, only logo and "Keluar".
  // Any other route was redirected to the courses step above.
  const setup = needsCourses(profile);
  return (
    <div className="flex min-h-screen flex-col">
      <div key={path} aria-hidden="true" className="sweep" />
      {setup ? <AppHeader setup onLogout={logout} /> : <AppHeader path={path} firstName={profile.name.split(" ")[0]} />}
      <main className="flex-1 px-4 py-6 sm:py-8">{children}</main>
      {!setup && <InviteBanner uid={uid} path={path} />}
    </div>
  );
}

/**
 * Top bar on every signed-in page (Persona blue style): logo, the three main sections, and the profile link.
 * While setup is unfinished (`setup`): only the logo (not a link) and "Keluar"; not sticky, so it never covers the page intro when scrolling.
 */
export function AppHeader(props: { path: string; firstName: string; setup?: false } | { setup: true; onLogout: () => void }) {
  const path = props.setup ? "" : props.path;
  const onProfile = path === "/profile";
  return (
    <header className={`${props.setup ? "relative" : "sticky top-0"} z-20 animate-slide-down border-b-4 border-white bg-black text-white`}>
      {/* Decorative: blue diagonal strip behind the profile link, a thin white slash, and a blue wedge under the bar. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-[30%] bg-volt [clip-path:polygon(24%_0,100%_0,100%_100%,0_100%)] sm:w-1/3" />
      <div aria-hidden className="pointer-events-none absolute hidden sm:block inset-y-0 right-[40%] w-3 translate-x-[0.4rem] bg-white [clip-path:polygon(60%_0,100%_0,40%_100%,0_100%)] sm:right-1/3" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-full h-3 bg-volt [clip-path:polygon(0_0,100%_0,58%_100%,0_100%)]" />
      <div className="relative mx-auto flex max-w-page items-center gap-1 px-4 py-2.5 sm:gap-4">
        {props.setup
          ? <div className="animate-slide-left"><Logo /></div>
          : <Link href="/" aria-label="Peerseus, ke beranda" className="animate-slide-left"><Logo /></Link>}
        {props.setup && <div className="flex-1" />}
        {!props.setup && <nav aria-label="Menu utama" className="flex flex-1 gap-1 pl-0.5 sm:gap-1.5 sm:pl-3">
          {NAV.map((n, i) => {
            const active = n.match(path);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                style={{ animationDelay: `${60 + i * 60}ms` }}
                className={`animate-slide-left whitespace-nowrap px-2.5 py-1.5 font-display text-[13px] uppercase tracking-wider transition duration-150 [clip-path:polygon(9px_0,100%_0,calc(100%-9px)_100%,0_100%)] hover:-rotate-2 focus-visible:bg-white focus-visible:text-black sm:px-5 sm:text-base sm:tracking-widest ${active ? "-rotate-2 bg-volt text-white" : "text-white hover:bg-white hover:text-black"}`}>
                {n.label}
              </Link>
            );
          })}
        </nav>}
        {props.setup ? (
          <button type="button" onClick={props.onLogout}
            className="animate-slide-right relative bg-white px-4 py-1.5 font-display text-[13px] uppercase tracking-wider text-black transition duration-150 [clip-path:polygon(9px_0,100%_0,calc(100%-9px)_100%,0_100%)] hover:bg-black hover:text-white sm:text-sm">Keluar</button>
        ) : (
        <Link href="/profile" aria-current={onProfile ? "page" : undefined} title="Profil"
          style={{ animationDelay: "240ms" }}
          className={`animate-slide-right max-w-[4.5rem] truncate px-3 py-1.5 font-display text-[13px] uppercase tracking-wider transition duration-150 [clip-path:polygon(9px_0,100%_0,calc(100%-9px)_100%,0_100%)] hover:rotate-2 focus-visible:bg-white focus-visible:text-black sm:max-w-[10rem] sm:text-sm ${onProfile ? "bg-white text-black" : "bg-black text-white hover:bg-white hover:text-black"}`}>{props.firstName}</Link>
        )}
      </div>
    </header>
  );
}

/** One screen: sign in, then fill the profile fields we actually need. */
function SignIn() {
  const { uid, authError, signInMicrosoft, signInGoogle, logout } = useAuth();
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
    return <LoginScreen top={uid ? <AppHeader setup onLogout={logout} /> : undefined}><ProfileSetup key={uid ?? "local"} /></LoginScreen>;
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
