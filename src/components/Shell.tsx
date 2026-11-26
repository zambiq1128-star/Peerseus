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
import { DoodleField } from "./Doodles";
import { Spinner } from "./ui";

const NAV = [
  { href: "/", label: "Mata Kuliah", match: (p: string) => p === "/" || p.startsWith("/courses") || p.startsWith("/materials/") },
  { href: "/duels", label: "Duel", match: (p: string) => p.startsWith("/duel") },
  { href: "/explore", label: "Jelajah", match: (p: string) => p.startsWith("/explore") || p === "/materials" },
];

export function Logo() {
  return <img src="/peerseus-logo.png" alt="Peerseus" width={281} height={253} className="h-9 w-auto sm:h-10" />;
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const { loading, uid, profile } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const redirect = !!profile?.major && needsCourses(profile) && path !== COURSES_PAGE;
  useEffect(() => {
    if (redirect) router.replace(COURSES_PAGE);
  }, [redirect, router]);

  if (loading || redirect) return <div className="world-mono grid min-h-screen place-items-center"><Spinner /></div>;
  if (!uid || !profile || !profile.major) return <SignIn />;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader path={path} firstName={profile.name.split(" ")[0]} />
      <main className="flex-1 px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}

/** Top bar on every signed-in page: a pastel paper strip with tiny doodles; the current section is circled in pencil. */
function AppHeader({ path, firstName }: { path: string; firstName: string }) {
  const onProfile = path === "/profile";
  return (
    <header className="sticky top-0 z-20 animate-slide-down bg-pink px-4 text-ink">
      <DoodleField className="hidden sm:block" spots={[
        { kind: "star", fill: "butter", x: "47%", y: "14%", size: 26, rot: 12, delay: 0.4 },
        { kind: "heart", fill: "lavender", x: "63%", y: "34%", size: 24, rot: -10, float: true },
        { kind: "cloud", fill: "sky", x: "73%", y: "8%", size: 30, rot: 4, float: true, delay: 1.2 },
        { kind: "sparkle", fill: "mint", x: "86%", y: "46%", size: 22, delay: 2 },
      ]} />
      <span aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-[3px] h-[6px] border-b-2 border-ink [filter:url(#pencil)]" />
      <div className="relative mx-auto flex max-w-page items-center gap-1 py-2 sm:gap-4">
        <Link href="/" aria-label="Peerseus, ke beranda" className="animate-slide-left transition hover:rotate-[-4deg]"><Logo /></Link>
        <nav aria-label="Menu utama" className="flex flex-1 gap-1 pl-0.5 sm:gap-3 sm:pl-3">
          {NAV.map((n, i) => {
            const active = n.match(path);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                style={{ animationDelay: `${60 + i * 60}ms` }}
                className="relative animate-slide-left whitespace-nowrap px-2.5 py-1 font-display text-lg font-bold leading-none transition hover:animate-wobble focus-visible:bg-surface sm:px-4 sm:text-2xl">
                {active && <span aria-hidden className="pointer-events-none absolute -inset-x-0.5 -inset-y-1 rotate-[-2deg] rounded-[50%] border-2 border-ink [filter:url(#pencil)]" />}
                {active && <span aria-hidden className="pointer-events-none absolute -inset-x-1 -inset-y-0.5 rotate-[3deg] rounded-[50%] border border-ink/70 [filter:url(#pencil)]" />}
                <span className={`relative ${active ? "" : "text-ink-soft"}`}>{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <Link href="/profile" aria-current={onProfile ? "page" : undefined} title="Profil"
          style={{ animationDelay: "240ms" }}
          className={`animate-slide-right max-w-[4.5rem] truncate border-[1.5px] border-ink px-3 py-0.5 font-display text-lg font-bold leading-tight transition [border-radius:12px_15px_11px_16px/15px_11px_16px_12px] hover:animate-wobble sm:max-w-[10rem] sm:text-xl ${onProfile ? "bg-lavender" : "bg-surface"}`}>{firstName}</Link>
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
        <button className="btn-ghost w-full !py-3 !text-2xl" disabled={busy} onClick={() => run(signInMicrosoft)}>
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
      <h2 className="font-display text-4xl font-bold leading-none">Isi profil pertama kali</h2>
      <div>
        <label className="label" htmlFor="nm">Nama</label>
        <input id="nm" className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </div>
      <AcademicFields value={academic} onChange={setAcademic} note={suggestion?.note} />
      <button className="btn-ghost w-full !py-2" disabled={busy || !name.trim()}>{busy ? "Menyimpan…" : "Lanjut pilih mata kuliah"}</button>
      {err && <p className="text-sm text-bad">{err}</p>}
    </form>
  );
}
