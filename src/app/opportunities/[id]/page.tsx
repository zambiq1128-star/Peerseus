"use client";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { OPP_TYPES, daysLeft, deadlineLabel, formatDeadline, isUrgent, posterName } from "@/lib/opportunities";
import type { Opportunity } from "@/lib/types";
import { MarkdownView } from "@/components/Markdown";
import OpenLink from "@/components/OpenLink";
import OpportunityForm from "@/components/OpportunityForm";
import { ErrorState, NotFound, Page, PageHeader, Section, Spinner, useAsync } from "@/components/ui";

export default function OpportunityPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const router = useRouter();
  const { data, error, reload } = useAsync(async () => {
    const opp = await db.get<Opportunity>("opportunities", id);
    return { opp, poster: opp ? await posterName(opp) : null };
  }, [id]);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reported, setReported] = useState(false);
  const [err, setErr] = useState("");

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  const { opp, poster } = data;
  if (!opp) return <NotFound title="Peluang tidak ditemukan" back={{ href: "/opportunities", label: "Ke hub peluang" }} />;
  const mine = opp.postedBy === profile!.id;
  const d = daysLeft(opp.deadline);

  async function remove() {
    setBusy(true);
    setErr("");
    try {
      await db.remove("opportunities", opp!.id);
      router.replace("/opportunities");
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  async function report() {
    setReported(true);
    try {
      await db.update("opportunities", opp!.id, { reports: (opp!.reports ?? 0) + 1 });
    } catch {
      setReported(false);
      setErr("Laporan belum terkirim. Coba lagi nanti.");
    }
  }

  return (
    <Page>
      <PageHeader
        back={{ href: "/opportunities", label: "Semua peluang", history: true }}
        eyebrow={OPP_TYPES[opp.type] ?? OPP_TYPES.lainnya}
        title={opp.title}
        sub={`${opp.organizer} · dibagikan ${opp.postedBy === "seed" ? "sebagai data contoh" : poster ? `oleh ${poster}` : "oleh pengguna"}`}
        action={mine && !editing && (
          <>
            <button className="btn-ghost" onClick={() => { setEditing(true); setConfirming(false); }}>Edit</button>
            <button className="btn-ghost" onClick={() => setConfirming(true)}>Hapus</button>
          </>
        )}
      />

      {confirming && (
        <div role="alertdialog" aria-label="Hapus peluang" className="callout flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-medium">Hapus peluang ini? Tidak bisa dibatalkan.</span>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy} onClick={remove}>{busy ? "Menghapus…" : "Ya, hapus"}</button>
            <button className="btn-ghost" disabled={busy} onClick={() => setConfirming(false)}>Batal</button>
          </div>
        </div>
      )}
      {err && <p role="alert" className="text-sm text-bad">{err}</p>}

      {editing ? (
        <OpportunityForm existing={opp} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />
      ) : (
        <>
          <div className="card space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={isUrgent(d) ? "badge-strong" : "badge"}>{deadlineLabel(d)}</span>
              <span className="text-sm">Deadline <strong>{formatDeadline(opp.deadline)}</strong></span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">Untuk:</span>
              {(opp.majors.length ? opp.majors : ["Semua fakultas"]).map((m) => <span key={m} className="badge">{m}</span>)}
            </div>
            <div><OpenLink href={opp.link} className="btn-primary" /></div>
          </div>

          <Section title="Deskripsi">
            <div className="card"><MarkdownView text={opp.description} /></div>
          </Section>

          {/* Langkah 2: bagian Diskusi (tanya dan cari tim) dipasang di sini. */}
          <div id="diskusi" />

          <div className="text-xs text-muted">
            {reported ? "Terima kasih, laporanmu tercatat." : !mine && (
              <button className="underline hover:text-ink" onClick={report}>Laporkan info ini</button>
            )}
          </div>
        </>
      )}
    </Page>
  );
}
