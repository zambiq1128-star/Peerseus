"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { joinCourse, myDuels } from "@/lib/peerseus";
import type { Course, Membership } from "@/lib/types";
import { PageTitle, Spinner, useAsync } from "@/components/ui";

export default function Home() {
  const { profile, refresh } = useAuth();
  const uid = profile!.id;
  const [busy, setBusy] = useState("");
  const { data } = useAsync(async () => {
    const courses = (await db.list<Course>("courses")).sort((a, b) => a.code.localeCompare(b.code));
    const ms = await db.list<Membership>("memberships", [["uid", "==", uid]]);
    const duels = await myDuels(uid);
    return { courses, ms, duels };
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
        <PageTitle title="Mata kuliahku" sub="Pilih mata kuliah untuk buka materi dan mulai duel." />
        {joined.length === 0 ? (
          <p className="text-sm text-muted">Belum ada. Gabung salah satu mata kuliah di bawah.</p>
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
