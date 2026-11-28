"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { MATERIAL_TYPES, materialType, myMaterials } from "@/lib/peerseus";
import { loadCardStats } from "@/lib/materialStats";
import type { Course, MaterialType } from "@/lib/types";
import MaterialCard, { MaterialGrid } from "@/components/MaterialCard";
import MaterialsTabs from "@/components/MaterialsTabs";
import { Empty, ErrorState, Page, PageHeader, Spinner, useAsync } from "@/components/ui";

type Show = "" | "publik" | "privat" | MaterialType;

/** Materiku: everything I uploaded, public and private, across courses. Uploading still starts from a course. */
export default function MyMaterials() {
  const { profile } = useAuth();
  const uid = profile!.id;
  const [show, setShow] = useState<Show>("");
  const { data, error, reload } = useAsync(async () => {
    const [materials, courses] = await Promise.all([myMaterials(uid), db.list<Course>("courses")]);
    // Discussions and quizzes exist only for public materials: one read per course that has one, not one per card.
    const stats = await loadCardStats([...new Set(materials.filter((m) => m.isPublic !== false).map((m) => m.courseId))]);
    return { materials, courses: new Map(courses.map((c) => [c.id, c])), stats };
  }, [uid]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
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
      <PageHeader title="Jelajah materi" sub="Materi, catatan, past paper, dan referensi dari semua mata kuliah." />
      <MaterialsTabs active="/materials" />
      <p className="text-sm text-muted">Semua materi yang kamu upload. Materi privat hanya bisa kamu lihat. Upload materi baru dari halaman mata kuliah.</p>
      {data.materials.length === 0 ? (
        <Empty title="Belum ada materi" action={<Link href="/" className="btn-primary">Ke mata kuliahku</Link>}>Buka salah satu mata kuliahmu, lalu klik “Upload materi”.</Empty>
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
            <MaterialGrid key={show} items={shown}>
              {(m) => (
                <MaterialCard key={m.id} m={m} course={data.courses.get(m.courseId)} discussions={data.stats.discussions.get(m.id)} quizSize={data.stats.quizSize.get(m.id)}
                  action={<Link href={`/materials/${m.id}/edit`} className="btn-ghost !px-3 !py-1 text-xs">Edit</Link>} />
              )}
            </MaterialGrid>
          )}
        </div>
      )}
    </Page>
  );
}
