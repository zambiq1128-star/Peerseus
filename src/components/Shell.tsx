"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { firebaseEnabled } from "@/lib/firebase";
import { MAJORS } from "./ui";

const NAV = [
  { href: "/", label: "Beranda" },
  { href: "/courses", label: "Mata Kuliah" },
  { href: "/duels", label: "Duel" },
  { href: "/partners", label: "Teman Belajar" },
  { href: "/opportunities", label: "Info Akademik" },
];

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-extrabold tracking-tight">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="15" fill="#0f1b3d" />
        <path d="M16 5 L19 14 L28 16 L19 18 L16 27 L13 18 L4 16 L13 14 Z" fill="#e0a526" />
      </svg>
      Peerseus
    </span>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const { loading, uid, profile, logout } = useAuth();
  const path = usePathname();
  const [open, setOpen] = useState(false);

  if (loading) return <div className="grid min-h-screen place-items-center text-muted">Memuat…</div>;
  if (!uid) return <Landing />;
  if (!profile || !profile.major) return <Onboarding />;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/"><Logo /></Link>
          <nav className="hidden gap-1 md:flex">
            {NAV.map((n) => {
              const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${active ? "bg-ink text-white" : "text-ink hover:bg-paper"}`}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/profile" className="hidden text-sm font-medium sm:block">{profile.name}</Link>
            <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={logout}>Keluar</button>
            <button className="btn-ghost !px-3 !py-1.5 md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">☰</button>
          </div>
        </div>
        {open && (
          <nav className="flex flex-col border-t border-line px-4 py-2 md:hidden">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="py-2 text-sm font-medium">{n.label}</Link>
            ))}
            <Link href="/profile" onClick={() => setOpen(false)} className="py-2 text-sm font-medium">Profil</Link>
          </nav>
        )}
      </header>
      {!firebaseEnabled && (
        <div className="bg-gold-soft px-4 py-1.5 text-center text-xs text-ink">
          Mode demo lokal: data disimpan di browser ini. Isi <code>.env.local</code> dengan konfigurasi Firebase untuk mode online.
        </div>
      )}
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

function Landing() {
  const { signInGoogle, signInLocal } = useAuth();
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const steps = [
    ["📚", "Buka materi", "Repositori materi bersama per mata kuliah."],
    ["✨", "Kuis dari AI", "Gemini membuat soal dari materi, diulas pengunggah."],
    ["⚔️", "Duel teman", "Duel kuis berwaktu, lawan dicocokkan lewat Elo."],
    ["🤝", "Teman belajar", "Lihat topik yang lemah & rekomendasi partner."],
  ];
  return (
    <div className="min-h-screen bg-ink text-white">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
        <Logo />
        <h1 className="mt-10 max-w-2xl text-4xl font-extrabold leading-tight sm:text-5xl">
          Academic Odyssey <span className="text-gold">with your Peers</span>
        </h1>
        <p className="mt-4 max-w-xl text-white/75">
          Materi, latihan, dan teman belajar dalam satu alur. Upload materi, dapatkan kuis dari AI, duel dengan teman seangkatan, lalu temukan partner belajar yang pas.
        </p>
        <div className="mt-8 max-w-md rounded-2xl bg-white p-5 text-ink">
          {firebaseEnabled ? (
            <button className="btn-primary w-full" onClick={() => signInGoogle().catch((e) => setErr(e.message))}>Masuk dengan Google</button>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) signInLocal(name.trim()); }} className="space-y-3">
              <label className="label" htmlFor="nm">Nama kamu (mode demo)</label>
              <input id="nm" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Cluny" />
              <button className="btn-primary w-full" disabled={!name.trim()}>Mulai</button>
            </form>
          )}
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([icon, t, d], i) => (
            <div key={t} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-2xl">{icon}</div>
              <div className="mt-2 text-sm text-gold">Langkah {i + 1}</div>
              <div className="font-bold">{t}</div>
              <div className="text-sm text-white/70">{d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Onboarding() {
  const { authName, profile, saveProfile } = useAuth();
  const [name, setName] = useState(profile?.name || authName);
  const [major, setMajor] = useState(MAJORS[0]);
  const [contact, setContact] = useState("");
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form
        className="card w-full max-w-md space-y-4"
        onSubmit={(e) => { e.preventDefault(); saveProfile({ name, major, contact, year: 1, isPublic: true }); }}
      >
        <Logo />
        <h1 className="text-xl font-bold">Lengkapi profil singkat</h1>
        <p className="text-sm text-muted">Data minimal saja. Kamu bisa atur apa yang publik di halaman profil.</p>
        <div><label className="label">Nama</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div>
          <label className="label">Fakultas / Sekolah</label>
          <select className="input" value={major} onChange={(e) => setMajor(e.target.value)}>
            {MAJORS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div><label className="label">Kontak untuk teman belajar (opsional)</label><input className="input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="LINE / IG / WA" /></div>
        <button className="btn-primary w-full">Simpan & lanjut</button>
      </form>
    </div>
  );
}
