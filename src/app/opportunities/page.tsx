"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { opportunityDiscussionCounts } from "@/lib/discussions";
import { plainSnippet } from "@/lib/latex";
import { OPP_TYPES, daysLeft, deadlineLabel, expired, forFaculty, formatDeadline, isUrgent, listOpportunities, upcoming } from "@/lib/opportunities";
import type { Opportunity, OpportunityType } from "@/lib/types";
import MaterialsTabs from "@/components/MaterialsTabs";
import OpenLink from "@/components/OpenLink";
import OpportunityForm from "@/components/OpportunityForm";
import { CollapsibleRows, Empty, ErrorState, Page, PageHeader, Section, Spinner, useAsync } from "@/components/ui";

type Kind = "" | OpportunityType;

/** Hub Peluang, the third Jelajah tab: scholarships, competitions, seminars and more, nearest deadline first. */
export default function Opportunities() {
  const { profile } = useAuth();
  const { data, error, reload } = useAsync(async () => {
    const list = await listOpportunities();
    // Discussion counts on the cards; a failed load only hides them.
    const counts = await opportunityDiscussionCounts(list.map((o) => o.id)).catch(() => new Map<string, { all: number; team: number }>());
    return { list, counts };
  }, []);
  const [kind, setKind] = useState<Kind>("");
  const [mine, setMine] = useState(false); // "Untuk fakultasku"
  const [adding, setAdding] = useState(false);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <Spinner />;

  const major = profile!.major;
  const inScope = (o: Opportunity) => !mine || forFaculty(o, major);
  const scoped = data.list.filter(inScope);
  const matches = (o: Opportunity) => !kind || o.type === kind;
  const soon = upcoming(scoped.filter(matches));
  const past = expired(scoped.filter(matches));
  const kinds: [Kind, string][] = [["", "Semua"], ...(Object.entries(OPP_TYPES) as [OpportunityType, string][])];
  const reset = () => { setKind(""); setMine(false); };

  return (
    <Page>
      <PageHeader
        title="Hub peluang"
        sub="Beasiswa, lomba, seminar, dan info lainnya dari sesama mahasiswa."
        action={<button className="btn-primary" onClick={() => setAdding(!adding)}>{adding ? "Tutup" : "+ Bagikan peluang"}</button>}
      />
      <MaterialsTabs active="/opportunities" />

      {adding && <OpportunityForm onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}

      {data.list.length === 0 ? (
        <Empty title="Belum ada peluang" action={!adding && <button className="btn-primary" onClick={() => setAdding(true)}>+ Bagikan peluang</button>}>
          Tahu beasiswa, lomba, atau seminar yang menarik? Bagikan supaya teman-temanmu tidak ketinggalan.
        </Empty>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {kinds.map(([k, label]) => (
              <button key={k || "all"} onClick={() => setKind(k)} className={kind === k ? "chip-active" : "chip"}>
                {label} ({scoped.filter((o) => !k || o.type === k).length})
              </button>
            ))}
            {major && (
              <button aria-pressed={mine} onClick={() => setMine(!mine)} className={mine ? "chip-active" : "chip"}>
                Untuk fakultasku ({major})
              </button>
            )}
          </div>

          {soon.length === 0 && past.length === 0 ? (
            <Empty title="Tidak ada peluang yang cocok" action={<button className="btn-ghost" onClick={reset}>Hapus filter</button>}>
              Coba jenis “Semua” atau tampilkan semua fakultas.
            </Empty>
          ) : (
            <>
              {soon.length === 0 ? (
                <Empty title="Tidak ada peluang yang masih buka">Semua yang cocok dengan filter sudah lewat deadline-nya (lihat di bawah).</Empty>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">{soon.map((o) => <OpportunityCard key={o.id} o={o} talk={data.counts.get(o.id)} />)}</div>
              )}
              {past.length > 0 && (
                <Section title={`Sudah lewat (${past.length})`}>
                  {/* limit 0: every row sits behind "Lihat semua", so the section starts collapsed */}
                  <CollapsibleRows key={`${kind}|${mine}`} items={past} limit={0}>
                    {(o) => (
                      <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <Link href={`/opportunities/${o.id}`} className="min-w-0 flex-1 hover:underline">
                          <div className="font-medium">{o.title}</div>
                          <div className="text-xs text-muted">{OPP_TYPES[o.type] ?? OPP_TYPES.lainnya} · {o.organizer} · berakhir {formatDeadline(o.deadline)}</div>
                        </Link>
                      </div>
                    )}
                  </CollapsibleRows>
                </Section>
              )}
            </>
          )}
        </div>
      )}
      <p className="text-xs text-muted">Info bertanda “(contoh)” adalah data contoh untuk demo.</p>
    </Page>
  );
}

function OpportunityCard({ o, talk }: { o: Opportunity; talk?: { all: number; team: number } }) {
  const d = daysLeft(o.deadline);
  return (
    <article className="card card-rot flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <span className="eyebrow">{OPP_TYPES[o.type] ?? OPP_TYPES.lainnya}</span>
        <span className={isUrgent(d) ? "badge-strong shrink-0" : "badge shrink-0"}>{deadlineLabel(d)}</span>
      </div>
      <Link href={`/opportunities/${o.id}`} className="mt-1 font-semibold hover:underline">{o.title}</Link>
      <div className="text-xs text-muted">{o.organizer} · deadline {formatDeadline(o.deadline)}</div>
      <p className="mt-2 line-clamp-3 flex-1 text-sm text-ink-soft">{plainSnippet(o.description)}</p>
      {talk && (
        <Link href={`/opportunities/${o.id}#diskusi`} className="mt-2 inline-flex flex-wrap items-center gap-2 self-start text-xs text-muted hover:text-ink">
          <span className="underline">{talk.all ? `${talk.all} diskusi` : "Belum ada diskusi"}</span>
          {talk.team > 0 && <span className="badge-strong">{talk.team} cari tim</span>}
        </Link>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {(o.majors.length ? o.majors : ["Semua fakultas"]).map((m) => <span key={m} className="badge">{m}</span>)}
        </div>
        <OpenLink href={o.link} />
      </div>
    </article>
  );
}
