"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { joinCourse, latestMaterials, MATERIAL_TYPES, materialType, myDuels } from "@/lib/peerseus";
import type { Course, Membership } from "@/lib/types";
import { PageTitle, Spinner, timeAgo, useAsync } from "@/components/ui";

export default function Home() {
  const { profile, refresh } = useAuth();
  const uid = profile!.id;
  const [busy, setBusy] = useState("");
  const { data } = useAsync(async () => {
    const courses = (await db.list<Course>("courses")).sort((a, b) => a.code.localeCompare(b.code));
    const ms = await db.list<Membership>("memberships", [["uid", "==", uid]]);
    const duels = await myDuels(uid);
    const latest = await latestMaterials(profile!.courseIds);
    return { courses, ms, duels, latest };
  }, [uid, profile?.courseIds.length]);

  if (!data) return <Spinner />;
  const myTurn = data.duels.filter((d) => d.status === "pending" && !(d.challengerId === uid ? d.challenger : d.opponent));
  const joined = data.courses.filter((c) => profile!.courseIds.includes(c.id));
  const others = data.courses.filter((c) => !profile!.courseIds.includes(c.id));

  async function join(id: string) {
    setBusy(id);
    await joinCourse(profile!, id);
    await refresh();
    setBusy("");
  }

  return (
    <div className="space-y-8">
      {myTurn.length > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-accent bg-accent-soft">
          <span className="text-sm font-medium">{myTurn.length} tantangan duel menunggu jawabanmu.</span>
          <Link href={`/duel/${myTurn[0].id}`} className="btn-primary">Jawab sekarang</Link>
        </div>
      )}

      <section>
        <PageTitle
          title="Mata kuliahku"
          sub="Pilih mata kuliah untuk buka materi dan mulai duel."
          action={
            <div className="flex gap-2">
              <Link href="/materials" className="btn-ghost">Materiku</Link>
              <Link href="/courses" className="btn-ghost">Atur mata kuliah</Link>
            </div>
          }
        />
        {joined.length === 0 ? (
          <p className="text-sm text-muted">Belum ada. <Link href="/courses" className="text-accent hover:underline">Atur mata kuliahmu</Link>, atau gabung salah satu di bawah.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {joined.map((c) => {
              const m = data.ms.find((x) => x.courseId === c.id);
              return (
                <Link key={c.id} href={`/courses/${c.id}`} className="card flex items-center justify-between gap-3 hover:border-accent">
                  <div>
                    <div className="text-xs font-semibold text-muted">{c.code}</div>
                    <div className="font-semibold">{c.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted">Rating</div>
                    <div className="font-bold">{m?.elo ?? "-"}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {data.latest.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted">Materi terbaru di mata kuliahku</h2>
          <div className="divide-y divide-line rounded-xl border border-line">
            {data.latest.map(({ material: m, quizReady }) => (
              <Link key={m.id} href={`/materials/${m.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-paper">
                <div className="min-w-0">
                  <div className="font-medium">{m.title}</div>
                  <div className="text-xs text-muted">
                    {data.courses.find((c) => c.id === m.courseId)?.code ?? m.courseId} · {MATERIAL_TYPES[materialType(m)]} · oleh {m.uploaderName} · {timeAgo(m.createdAt)}
                  </div>
                </div>
                {quizReady && <span className="badge shrink-0 !bg-accent-soft !text-accent">Kuis siap duel</span>}
              </Link>
            ))}
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted">Mata kuliah lain</h2>
          <div className="divide-y divide-line rounded-xl border border-line">
            {others.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <div className="font-medium">{c.code} · {c.name}</div>
                  <div className="text-xs text-muted">{c.description}</div>
                </div>
                <button className="btn-ghost shrink-0" disabled={busy === c.id} onClick={() => join(c.id)}>
                  {busy === c.id ? "…" : "Gabung"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
