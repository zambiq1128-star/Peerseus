"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { courseMembers, joinCourse } from "@/lib/peerseus";
import type { Course, Material, Quiz } from "@/lib/types";
import { Empty, PageTitle, Spinner, TopicBar, timeAgo, useAsync } from "@/components/ui";
import PartnerList from "@/components/PartnerList";

type Tab = "materi" | "leaderboard" | "partner";

export default function CoursePage() {
  const { id } = useParams<{ id: string }>();
  const { profile, refresh } = useAuth();
  const uid = profile!.id;
  const [tab, setTab] = useState<Tab>("materi");
  const [q, setQ] = useState("");
  const joined = profile!.courseIds.includes(id);

  const { data, reload } = useAsync(async () => {
    const [course, materials, quizzes, members] = await Promise.all([
      db.get<Course>("courses", id),
      db.list<Material>("materials", [["courseId", "==", id]]),
      db.list<Quiz>("quizzes", [["courseId", "==", id]]),
      courseMembers(id),
    ]);
    return { course, materials: materials.sort((a, b) => b.createdAt - a.createdAt), quizzes, members: members.sort((a, b) => b.elo - a.elo) };
  }, [id]);

  if (!data) return <Spinner />;
  if (!data.course) return <Empty>Mata kuliah tidak ditemukan.</Empty>;
  const me = data.members.find((m) => m.uid === uid);
  const filtered = data.materials.filter((m) => (m.title + m.topics.join(" ") + m.description).toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageTitle
        title={`${data.course.code} · ${data.course.name}`}
        sub={data.course.description}
        action={
          joined ? (
            <Link href={`/courses/${id}/upload`} className="btn-gold">+ Upload materi</Link>
          ) : (
            <button className="btn-gold" onClick={async () => { await joinCourse(profile!, id); await refresh(); reload(); }}>Gabung mata kuliah</button>
          )
        }
      />

      {me && (
        <div className="card mb-6 grid gap-4 sm:grid-cols-[180px_1fr]">
          <div>
            <div className="text-xs text-muted">Elo kamu</div>
            <div className="text-3xl font-extrabold">{me.elo}</div>
            <div className="text-xs text-muted">Peringkat #{data.members.findIndex((m) => m.uid === uid) + 1} dari {data.members.length}</div>
          </div>
          <div className="space-y-2">
            {Object.keys(me.topicStats).length === 0 ? (
              <p className="text-sm text-muted">Selesaikan duel pertama untuk melihat kekuatan per topik.</p>
            ) : (
              Object.entries(me.topicStats).map(([t, s]) => <TopicBar key={t} topic={t} {...s} />)
            )}
          </div>
        </div>
      )}

      <div className="mb-4 flex gap-1 rounded-xl bg-white p-1 ring-1 ring-line sm:inline-flex">
        {(["materi", "leaderboard", "partner"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-lg px-4 py-1.5 text-sm font-semibold ${tab === t ? "bg-ink text-white" : ""}`}>
            {t === "materi" ? "Materi" : t === "leaderboard" ? "Leaderboard" : "Teman Belajar"}
          </button>
        ))}
      </div>

      {tab === "materi" && (
        <div className="space-y-3">
          <input className="input" placeholder="Cari materi atau topik…" value={q} onChange={(e) => setQ(e.target.value)} />
          {filtered.length === 0 && <Empty>Belum ada materi. Jadilah yang pertama upload!</Empty>}
          {filtered.map((m) => {
            const quiz = data.quizzes.find((x) => x.materialId === m.id);
            return (
              <Link key={m.id} href={`/materials/${m.id}`} className="card flex flex-wrap items-center justify-between gap-3 hover:border-ink">
                <div>
                  <div className="font-bold">{m.title}</div>
                  <div className="text-xs text-muted">oleh {m.uploaderName} · {timeAgo(m.createdAt)}{m.fileName ? ` · 📎 ${m.fileName}` : ""}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.topics.map((t) => <span key={t} className="badge bg-paper">{t}</span>)}
                  </div>
                </div>
                {quiz?.status === "published" ? (
                  <span className="badge bg-sea/10 text-sea">✓ Kuis {quiz.questions.length} soal</span>
                ) : quiz?.status === "draft" ? (
                  <span className="badge bg-gold-soft">Kuis menunggu review</span>
                ) : (
                  <span className="badge bg-paper text-muted">Belum ada kuis</span>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {tab === "leaderboard" && (
        <div className="card overflow-x-auto !p-0">
          <table className="w-full text-sm">
            <thead className="bg-paper text-left text-xs text-muted">
              <tr><th className="px-4 py-2">#</th><th className="px-4 py-2">Nama</th><th className="px-4 py-2">Fakultas</th><th className="px-4 py-2">M/K/S</th><th className="px-4 py-2 text-right">Elo</th></tr>
            </thead>
            <tbody>
              {data.members.map((m, i) => (
                <tr key={m.id} className={`border-t border-line ${m.uid === uid ? "bg-gold-soft" : ""}`}>
                  <td className="px-4 py-2 font-bold">{i + 1}</td>
                  <td className="px-4 py-2">{m.name}{m.isBot && <span className="ml-2 badge bg-paper text-muted">demo</span>}</td>
                  <td className="px-4 py-2">{m.major}</td>
                  <td className="px-4 py-2 text-muted">{m.wins}/{m.losses}/{m.draws}</td>
                  <td className="px-4 py-2 text-right font-bold">{m.elo}</td>
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
