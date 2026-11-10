"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { myDuels } from "@/lib/peerseus";
import type { Course, Membership } from "@/lib/types";
import { Empty, PageTitle, Spinner, useAsync } from "@/components/ui";

export default function Home() {
  const { profile } = useAuth();
  const uid = profile!.id;
  const { data } = useAsync(async () => {
    const courses = (await Promise.all(profile!.courseIds.map((id) => db.get<Course>("courses", id)))).filter(Boolean) as Course[];
    const ms = (await Promise.all(profile!.courseIds.map((id) => db.get<Membership>("memberships", `${id}_${uid}`)))).filter(Boolean) as Membership[];
    const duels = await myDuels(uid);
    return { courses, ms, duels };
  }, [uid, profile?.courseIds.length]);

  if (!data) return <Spinner />;
  const waiting = data.duels.filter((d) => d.status === "pending" && ((d.opponentId === uid && !d.opponent) || (d.challengerId === uid && !d.challenger)));

  return (
    <div className="space-y-8">
      <PageTitle title={`Halo, ${profile!.name.split(" ")[0]} 👋`} sub="Lanjutkan perjalanan akademikmu hari ini." />

      <ol className="grid gap-3 sm:grid-cols-4">
        {[
          ["1", "Buka / upload materi", "/courses"],
          ["2", "Generate & ulas kuis", "/courses"],
          ["3", "Tantang teman duel", "/duels"],
          ["4", "Temukan teman belajar", "/partners"],
        ].map(([n, t, href]) => (
          <Link key={n} href={href} className="card flex items-center gap-3 !p-4 hover:border-ink">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold font-bold">{n}</span>
            <span className="text-sm font-semibold">{t}</span>
          </Link>
        ))}
      </ol>

      {waiting.length > 0 && (
        <section className="card border-gold bg-gold-soft">
          <h2 className="font-bold">⚔️ {waiting.length} duel menunggu giliranmu</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {waiting.map((d) => (
              <Link key={d.id} href={`/duel/${d.id}`} className="btn-primary">
                Lawan {d.challengerId === uid ? d.opponentName : d.challengerName} · {d.quizTitle}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Mata kuliahku</h2>
          <Link href="/courses" className="text-sm font-semibold text-sea">+ Gabung mata kuliah</Link>
        </div>
        {data.courses.length === 0 ? (
          <Empty>Kamu belum gabung mata kuliah. <Link className="font-semibold text-sea" href="/courses">Pilih mata kuliah</Link> untuk mulai.</Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.courses.map((c) => {
              const m = data.ms.find((x) => x.courseId === c.id);
              return (
                <Link key={c.id} href={`/courses/${c.id}`} className="card hover:border-ink">
                  <div className="text-xs font-bold text-sea">{c.code}</div>
                  <div className="font-bold">{c.name}</div>
                  <div className="mt-3 flex gap-4 text-sm">
                    <span>Elo <b>{m?.elo ?? "-"}</b></span>
                    <span className="text-muted">{m?.wins ?? 0}M · {m?.losses ?? 0}K · {m?.draws ?? 0}S</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
