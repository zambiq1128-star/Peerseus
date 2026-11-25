"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { courseMembers, joinCourse, MATERIAL_TYPES, materialType, PRIVATE_MATERIALS } from "@/lib/peerseus";
import type { Course, Material, MaterialType, Quiz } from "@/lib/types";
import { Empty, Spinner, TopicBar, useAsync } from "@/components/ui";
import PartnerList from "@/components/PartnerList";

const TABS = { materi: "Materi", peringkat: "Peringkat", partner: "Teman belajar" } as const;
type Tab = keyof typeof TABS;

export default function CoursePage() {
  const { id } = useParams<{ id: string }>();
  const { profile, refresh } = useAuth();
  const uid = profile!.id;
  const [tab, setTab] = useState<Tab>("materi");
  const [kind, setKind] = useState<"" | MaterialType>("");
  const joined = profile!.courseIds.includes(id);

  const { data, reload } = useAsync(async () => {
    const [course, materials, mine, quizzes, members] = await Promise.all([
      db.get<Course>("courses", id),
      db.list<Material>("materials", [["courseId", "==", id]]),
      // My private materials (only mine are readable), shown to me alongside the public ones.
      db.list<Material>(PRIVATE_MATERIALS, [["uploaderId", "==", uid]]),
      db.list<Quiz>("quizzes", [["courseId", "==", id]]),
      courseMembers(id),
    ]);
    return { course, materials: [...materials, ...mine.filter((m) => m.courseId === id)].sort((a, b) => b.createdAt - a.createdAt), quizzes, members: members.sort((a, b) => b.elo - a.elo) };
  }, [id, uid]);

  if (!data) return <Spinner />;
  if (!data.course) return <Empty>Mata kuliah tidak ditemukan.</Empty>;
  const me = data.members.find((m) => m.uid === uid);
  const published = data.quizzes.filter((q) => q.status === "published");
  const shown = data.materials.filter((m) => !kind || materialType(m) === kind);
  const kinds: ["" | MaterialType, string, number][] = [
    ["", "Semua", data.materials.length],
    ...(Object.entries(MATERIAL_TYPES) as [MaterialType, string][]).map(([k, v]) => [k, v, data.materials.filter((m) => materialType(m) === k).length] as ["" | MaterialType, string, number]),
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-ink">← Mata kuliah</Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-muted">{data.course.code}</div>
            <h1 className="text-xl font-bold">{data.course.name}</h1>
          </div>
          {joined ? (
            <div className="flex gap-2">
              <Link href={`/courses/${id}/upload`} className="btn-ghost">Upload materi</Link>
              {published.length > 0 && <Link href={`/duel/new?course=${id}`} className="btn-primary">Mulai duel</Link>}
            </div>
          ) : (
            <button className="btn-primary" onClick={async () => { await joinCourse(profile!, id); await refresh(); reload(); }}>Gabung mata kuliah</button>
          )}
        </div>
      </div>

      {me && (
        <div className="card grid gap-4 sm:grid-cols-[140px_1fr]">
          <div>
            <div className="text-xs text-muted">Rating kamu</div>
            <div className="text-3xl font-bold">{me.elo}</div>
            <div className="text-xs text-muted">Peringkat {data.members.findIndex((m) => m.uid === uid) + 1} dari {data.members.length}</div>
          </div>
          <div className="space-y-2">
            {Object.keys(me.topicStats).length === 0 ? (
              <p className="text-sm text-muted">Selesaikan satu duel untuk melihat kekuatanmu per topik.</p>
            ) : (
              Object.entries(me.topicStats).map(([t, s]) => <TopicBar key={t} topic={t} {...s} />)
            )}
          </div>
        </div>
      )}

      <div className="flex gap-4 border-b border-line">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 pb-2 text-sm font-medium ${tab === t ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}>
            {TABS[t]}
          </button>
        ))}
      </div>

      {tab === "materi" && (
        data.materials.length === 0 ? <Empty>Belum ada materi. Jadilah yang pertama upload.</Empty> : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {kinds.map(([k, label, n]) => (
                <button key={k || "all"} onClick={() => setKind(k)} className={`rounded-full border px-3 py-1 text-xs font-medium ${kind === k ? "border-accent bg-accent-soft text-ink" : "border-line text-muted hover:text-ink"}`}>
                  {label} ({n})
                </button>
              ))}
            </div>
            {shown.length === 0 ? <Empty>Belum ada {MATERIAL_TYPES[kind as MaterialType].toLowerCase()} di mata kuliah ini.</Empty> : (
              <div className="divide-y divide-line rounded-xl border border-line">
                {shown.map((m) => {
                  const quiz = data.quizzes.find((x) => x.materialId === m.id);
                  return (
                    <Link key={m.id} href={`/materials/${m.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-paper">
                      <div>
                        <div className="font-medium">{m.title}{m.isPublic === false && <span className="badge ml-2">Privat</span>}</div>
                        <div className="text-xs text-muted">{MATERIAL_TYPES[materialType(m)]} · {m.topics.join(", ")} · oleh {m.uploaderName}</div>
                      </div>
                      <span className="badge shrink-0">
                        {quiz?.status === "published" ? `Kuis ${quiz.questions.length} soal` : quiz?.status === "draft" ? "Kuis diulas" : "Belum ada kuis"}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )
      )}

      {tab === "peringkat" && (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-paper text-left text-xs text-muted">
              <tr><th className="px-4 py-2">#</th><th className="px-4 py-2">Nama</th><th className="px-4 py-2">Menang/Kalah</th><th className="px-4 py-2 text-right">Rating</th></tr>
            </thead>
            <tbody>
              {data.members.map((m, i) => (
                <tr key={m.id} className={`border-t border-line ${m.uid === uid ? "bg-accent-soft font-medium" : ""}`}>
                  <td className="px-4 py-2">{i + 1}</td>
                  <td className="px-4 py-2"><Link href={`/users/${m.uid}`} className="hover:underline">{m.name}</Link> <span className="text-xs text-muted">{m.major}{m.isBot ? " · demo" : ""}</span></td>
                  <td className="px-4 py-2 text-muted">{m.wins}/{m.losses}</td>
                  <td className="px-4 py-2 text-right font-semibold">{m.elo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "partner" && (joined ? <PartnerList courseId={id} /> : <Empty>Gabung mata kuliah dulu untuk dapat rekomendasi.</Empty>)}
    </div>
  );
}
