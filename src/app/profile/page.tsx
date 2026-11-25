"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { academicOf, academicPatch, currentIntakeYear, readNim, type Academic } from "@/lib/itb";
import { isShown } from "@/lib/privacy";
import type { Privacy } from "@/lib/types";
import AcademicFields from "@/components/AcademicFields";
import { AccountBadge, PageTitle } from "@/components/ui";

const SHOW: Record<keyof Privacy, string> = {
  showProgram: "Tampilkan prodi (atau prodi incaran)",
  showEntryYear: "Tampilkan angkatan",
  showContact: "Tampilkan kontak",
};

export default function Profile() {
  const { profile, authEmail, saveProfile, logout } = useAuth();
  // Profiles from before the angkatan field get it prefilled from the NIM.
  const [p, setP] = useState(() => ({ ...profile!, entryYear: profile!.entryYear ?? readNim(authEmail)?.entryYear }));
  const [academic, setAcademic] = useState<Academic>(() => academicOf(profile, { faculty: profile!.major, stage: "tpb", program: "" }));
  const [saved, setSaved] = useState(false);
  return (
    <div className="mx-auto max-w-xl">
      <PageTitle title="Profil" sub="Kami hanya menyimpan data yang perlu. Kamu yang menentukan apa yang terlihat orang lain." />
      {p.isItbVerified !== undefined && (
        <p className="mb-3 flex items-center gap-2 text-sm text-muted">{p.isItbVerified ? "Akun ITB terverifikasi" : "Kamu masuk sebagai tamu"} <AccountBadge itb={p.isItbVerified} /></p>
      )}
      <form className="card space-y-4" onSubmit={async (e) => { e.preventDefault(); await saveProfile({ ...p, ...academicPatch(academic) }); setSaved(true); }}>
        <div><label className="label">Nama</label><input className="input" required value={p.name} onChange={(e) => { setSaved(false); setP({ ...p, name: e.target.value }); }} /></div>
        <AcademicFields value={academic} onChange={(a) => { setSaved(false); setAcademic(a); }} />
        <div>
          <label className="label" htmlFor="ey">Angkatan</label>
          <input id="ey" className="input" type="number" min={1990} max={currentIntakeYear()} value={p.entryYear ?? ""} placeholder="mis. 2025"
            onChange={(e) => { setSaved(false); setP({ ...p, entryYear: e.target.value ? Number(e.target.value) : undefined }); }} />
        </div>
        <p className="text-xs text-muted">Ganti jurusan atau semester? <Link href="/courses" className="text-accent hover:underline">Atur mata kuliah</Link> setelah menyimpan.</p>
        <div><label className="label">Bio singkat</label><input className="input" value={p.bio ?? ""} onChange={(e) => { setSaved(false); setP({ ...p, bio: e.target.value }); }} placeholder="mis. Suka belajar malam, open diskusi kalkulus" /></div>
        <div><label className="label">Kontak</label><input className="input" value={p.contact ?? ""} onChange={(e) => { setSaved(false); setP({ ...p, contact: e.target.value }); }} placeholder="LINE / IG / WA" /></div>
        <fieldset className="space-y-2 border-t border-line pt-4">
          <legend className="label">Yang bisa dilihat orang lain</legend>
          {(Object.keys(SHOW) as (keyof Privacy)[]).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isShown(p, k)} onChange={(e) => { setSaved(false); setP({ ...p, privacy: { ...p.privacy, [k]: e.target.checked } }); }} />
              {SHOW[k]}
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={p.isPublic} onChange={(e) => { setSaved(false); setP({ ...p, isPublic: e.target.checked }); }} />
            Tampilkan saya di rekomendasi teman belajar
          </label>
          <p className="text-xs text-muted">
            Yang disembunyikan disimpan terpisah dan hanya bisa dibaca akunmu. <Link href={`/users/${p.id}`} className="text-accent hover:underline">Lihat profilmu seperti orang lain melihatnya</Link>
          </p>
        </fieldset>
        <button className="btn-primary w-full">{saved ? "Tersimpan" : "Simpan"}</button>
      </form>
      <button className="btn-ghost mt-3 w-full" onClick={logout}>Keluar</button>
    </div>
  );
}
