"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { MATERIAL_TYPES, materialType, myMaterials } from "@/lib/peerseus";
import type { Course, MaterialType, Quiz } from "@/lib/types";
import { Empty, Page, PageHeader, Spinner, timeAgo, useAsync } from "@/components/ui";

type Show = "" | "publik" | "privat" | MaterialType;

/** Materiku: everything I uploaded, public and private, across courses. Uploading still starts from a course. */
export default function MyMaterials() {
  const { profile } = useAuth();
  const uid = profile!.id;
  const [show, setShow] = useState<Show>("");
  const { data } = useAsync(async () => {
    const [materials, courses, quizzes] = await Promise.all([
      myMaterials(uid),
      db.list<Course>("courses"),
      db.list<Quiz>("quizzes", [["createdBy", "==", uid]]),
    ]);
    return { materials, courses: new Map(courses.map((c) => [c.id, c])), quizzes: new Map(quizzes.map((q) => [q.materialId, q])) };
  }, [uid]);

  if (!data) return <Spinner />;
  const isPrivate = (m: { isPublic?: boolean }) => m.isPublic === false;
  const filters: [Show, string][] = [["", "Semua"], ["publik", "Publik"], ["privat", "Privat"], ...(Object.entries(MATERIAL_TYPES) as [MaterialType, string][])];
  const count = (f: Show) => data.materials.filter((m) => matches(m, f)).length;
  function matches(m: { isPublic?: boolean; type?: MaterialType }, f: Show) {
    if (!f) return true;
    if (f === "publik") return !isPrivate(m);
    if (f === "privat") return isPrivate(m);
    return materialType(m) === f;
  }
  const shown = data.materials.filter((m) => matches(m, show));

  return (
    <Page>
      <PageHeader
        back={{ href: "/", label: "Mata kuliah" }}
        title="Materiku"
        sub="Semua materi yang kamu upload. Materi privat hanya bisa kamu lihat. Upload materi baru dari halaman mata kuliah."
      />
      {data.materials.length === 0 ? (
        <Empty>Belum ada materi. Buka <Link href="/" className="link">mata kuliahmu</Link>, lalu klik “Upload materi”.</Empty>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {filters.map(([f, label]) => (
              <button key={f || "all"} onClick={() => setShow(f)} className={show === f ? "chip-active" : "chip"}>
                {label} ({count(f)})
              </button>
            ))}
          </div>
          {shown.length === 0 ? <Empty>Tidak ada materi yang cocok.</Empty> : (
            <div className="rows">
              {shown.map((m) => {
                const quiz = data.quizzes.get(m.id);
                const course = data.courses.get(m.courseId);
                return (
                  <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <Link href={`/materials/${m.id}`} className="min-w-0 flex-1 hover:underline">
                      <div className="font-medium">{m.title}</div>
                      <div className="text-xs text-muted">{course?.code ?? m.courseId} · {MATERIAL_TYPES[materialType(m)]} · {timeAgo(m.updatedAt ?? m.createdAt)}</div>
                    </Link>
                    <div className="flex items-center gap-2">
                      <span className="badge">{isPrivate(m) ? "Privat" : quiz?.status === "published" ? "Publik · kuis siap" : "Publik"}</span>
                      <Link href={`/materials/${m.id}/edit`} className="btn-ghost !py-1.5">Edit</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
