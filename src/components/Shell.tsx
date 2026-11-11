"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { firebaseEnabled } from "@/lib/firebase";
import { MAJORS } from "./ui";

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

/** One screen: sign in and fill the two profile fields we actually need. */
function SignIn() {
  const { uid, authName, profile, signInGoogle, signInLocal, saveProfile } = useAuth();
  const [name, setName] = useState(profile?.name || authName);
  const [major, setMajor] = useState(MAJORS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const needsGoogle = firebaseEnabled && !uid;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      if (!uid) await signInLocal(name.trim(), major);
      else await saveProfile({ name: name.trim(), major, year: 1, isPublic: true });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <Logo />
        <h1 className="mt-6 text-2xl font-bold leading-snug">Belajar bareng teman seangkatan.</h1>
        <p className="mt-2 text-sm text-muted">Buka materi kuliah, latihan lewat duel kuis, lalu temukan teman belajar yang pas.</p>
        <div className="card mt-6">
          {needsGoogle ? (
            <button className="btn-primary w-full" onClick={() => signInGoogle().catch((e) => setErr(e.message))}>Masuk dengan Google</button>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="label" htmlFor="nm">Nama</label>
                <input id="nm" className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              </div>
              <div>
                <label className="label" htmlFor="mj">Fakultas / Sekolah</label>
                <select id="mj" className="input" value={major} onChange={(e) => setMajor(e.target.value)}>
                  {MAJORS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <button className="btn-primary w-full" disabled={busy || !name.trim()}>{busy ? "Masuk…" : "Mulai"}</button>
            </form>
          )}
          {err && <p className="mt-3 text-sm text-bad">{err}</p>}
        </div>
      </div>
    </div>
  );
}
