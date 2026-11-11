"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { MAJORS, PageTitle } from "@/components/ui";

export default function Profile() {
  const { profile, saveProfile, logout } = useAuth();
  const [p, setP] = useState(profile!);
  const [saved, setSaved] = useState(false);
  return (
    <div className="mx-auto max-w-xl">
      <PageTitle title="Profil" sub="Kami hanya menyimpan data yang perlu. Kamu yang menentukan apa yang terlihat orang lain." />
      <form className="card space-y-4" onSubmit={async (e) => { e.preventDefault(); await saveProfile(p); setSaved(true); }}>
        <div><label className="label">Nama</label><input className="input" required value={p.name} onChange={(e) => { setSaved(false); setP({ ...p, name: e.target.value }); }} /></div>
        <div><label className="label">Fakultas / Sekolah</label><select className="input" value={p.major} onChange={(e) => { setSaved(false); setP({ ...p, major: e.target.value }); }}>{MAJORS.map((m) => <option key={m}>{m}</option>)}</select></div>
        <div><label className="label">Bio singkat</label><input className="input" value={p.bio ?? ""} onChange={(e) => { setSaved(false); setP({ ...p, bio: e.target.value }); }} placeholder="mis. Suka belajar malam, open diskusi kalkulus" /></div>
        <div><label className="label">Kontak</label><input className="input" value={p.contact ?? ""} onChange={(e) => { setSaved(false); setP({ ...p, contact: e.target.value }); }} placeholder="LINE / IG / WA" /></div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={p.isPublic} onChange={(e) => { setSaved(false); setP({ ...p, isPublic: e.target.checked }); }} />
          Tampilkan saya di rekomendasi teman belajar
        </label>
        <button className="btn-primary w-full">{saved ? "Tersimpan" : "Simpan"}</button>
      </form>
      <button className="btn-ghost mt-3 w-full" onClick={logout}>Keluar</button>
    </div>
  );
}
