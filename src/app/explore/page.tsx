"use client";
import Link from "next/link";
import { useState } from "react";
import { db } from "@/lib/db";
import { MATERIAL_TYPES, materialType, withUploaderNames } from "@/lib/peerseus";
import type { Course, Material, MaterialType } from "@/lib/types";
import { loadCardStats, type CardStats } from "@/lib/materialStats";
import MaterialCard from "@/components/MaterialCard";
import MaterialsTabs from "@/components/MaterialsTabs";
import { Empty, ErrorState, Page, PageHeader, Spinner, useAsync } from "@/components/ui";

/** Cards shown at first and added per "Muat lebih banyak". */
const PAGE_SIZE = 12;

type Kind = "" | MaterialType;

/**
 * Jelajah: browse and search every public material, newest first, across all courses.
 * Reads only the `materials` collection, so private materials (privateMaterials) never show here.
 */
export default function Explore() {
  const { data, error, reload } = useAsync(async () => {
    // Discussions and quizzes are read once for all courses (two queries), then counted per card in the app.
    const [materials, courses, stats] = await Promise.all([
      db.list<Material>("materials"),
      db.list<Course>("courses"),
      loadCardStats(),
    ]);
    return {
      materials: (await withUploaderNames(materials.filter((m) => m.isPublic !== false))).sort((a, b) => b.createdAt - a.createdAt),
      courses: new Map(courses.map((c) => [c.id, c])),
      stats,
    };
  }, []);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("");

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <Spinner />;

  const query = q.trim().toLowerCase();
  const course = (m: Material) => data.courses.get(m.courseId);
  const matchesQuery = (m: Material) =>
    !query ||
    [m.title, m.uploaderName, m.description ?? "", ...m.topics, course(m)?.code ?? m.courseId, course(m)?.name ?? ""].some((s) => s.toLowerCase().includes(query));
  const found = data.materials.filter(matchesQuery);
  const shown = found.filter((m) => !kind || materialType(m) === kind);
  const kinds: [Kind, string][] = [["", "Semua"], ...(Object.entries(MATERIAL_TYPES) as [MaterialType, string][])];

  return (
    <Page>
      <PageHeader title="Jelajah materi" sub="Materi, catatan, past paper, dan referensi dari semua mata kuliah." />
      <MaterialsTabs active="/explore" />

      {data.materials.length === 0 ? (
        <Empty title="Belum ada materi publik" action={<Link href="/" className="btn-primary">Ke mata kuliahku</Link>}>
          Jadilah yang pertama berbagi: buka mata kuliahmu, lalu klik “Upload materi”.
        </Empty>
      ) : (
        <div className="space-y-4">
          <div className="space-y-3">
            <input
              type="search"
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari judul, topik, mata kuliah, atau pengunggah"
              aria-label="Cari materi"
            />
            <div className="flex flex-wrap gap-2">
              {kinds.map(([k, label]) => (
                <button key={k || "all"} onClick={() => setKind(k)} className={kind === k ? "chip-active" : "chip"}>
                  {label} ({found.filter((m) => !k || materialType(m) === k).length})
                </button>
              ))}
            </div>
          </div>

          {shown.length === 0 ? (
            <Empty title="Tidak ada materi yang cocok" action={<button className="btn-ghost" onClick={() => { setQ(""); setKind(""); }}>Hapus pencarian</button>}>
              Coba kata lain atau pilih jenis “Semua”.
            </Empty>
          ) : (
            // Keyed by search and filter so the feed starts from the top page again when either changes.
            <Feed key={`${query}|${kind}`} items={shown} courses={data.courses} stats={data.stats} />
          )}
        </div>
      )}
    </Page>
  );
}

function Feed({ items, courses, stats }: { items: Material[]; courses: Map<string, Course>; stats: CardStats }) {
  const [count, setCount] = useState(PAGE_SIZE);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {items.slice(0, count).map((m) => (
          <MaterialCard key={m.id} m={m} course={courses.get(m.courseId)} discussions={stats.discussions.get(m.id)} quizSize={stats.quizSize.get(m.id)} />
        ))}
      </div>
      {count < items.length ? (
        <button className="btn-ghost w-full" onClick={() => setCount(count + PAGE_SIZE)}>
          Muat lebih banyak ({items.length - count} lagi)
        </button>
      ) : (
        <p className="text-center text-xs text-muted">{items.length} materi ditampilkan.</p>
      )}
    </div>
  );
}
