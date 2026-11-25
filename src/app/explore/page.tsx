"use client";
import Link from "next/link";
import { useState } from "react";
import { db } from "@/lib/db";
import { MATERIAL_TYPES, materialType, withUploaderNames } from "@/lib/peerseus";
import type { Course, Material, MaterialType, Quiz } from "@/lib/types";
import MaterialsTabs from "@/components/MaterialsTabs";
import { Empty, ErrorState, Page, PageHeader, Spinner, timeAgo, useAsync } from "@/components/ui";

/** Cards shown at first and added per "Muat lebih banyak". */
const PAGE_SIZE = 12;

type Kind = "" | MaterialType;

/**
 * Jelajah: browse and search every public material, newest first, across all courses.
 * Reads only the `materials` collection, so private materials (privateMaterials) never show here.
 */
export default function Explore() {
  const { data, error, reload } = useAsync(async () => {
    const [materials, courses, quizzes] = await Promise.all([
      db.list<Material>("materials"),
      db.list<Course>("courses"),
      db.list<Quiz>("quizzes"),
    ]);
    return {
      materials: (await withUploaderNames(materials.filter((m) => m.isPublic !== false))).sort((a, b) => b.createdAt - a.createdAt),
      courses: new Map(courses.map((c) => [c.id, c])),
      quizReady: new Set(quizzes.filter((q) => q.status === "published").map((q) => q.materialId)),
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
    [m.title, m.uploaderName, ...m.topics, course(m)?.code ?? m.courseId, course(m)?.name ?? ""].some((s) => s.toLowerCase().includes(query));
  const found = data.materials.filter(matchesQuery);
  const shown = found.filter((m) => !kind || materialType(m) === kind);
  const kinds: [Kind, string][] = [["", "Semua"], ...(Object.entries(MATERIAL_TYPES) as [MaterialType, string][])];

  return (
    <Page>
      <PageHeader title="Jelajah materi" sub="Materi, catatan, dan past paper dari semua mata kuliah." />
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
            <Feed key={`${query}|${kind}`} items={shown} courses={data.courses} quizReady={data.quizReady} />
          )}
        </div>
      )}
    </Page>
  );
}

function Feed({ items, courses, quizReady }: { items: Material[]; courses: Map<string, Course>; quizReady: Set<string> }) {
  const [count, setCount] = useState(PAGE_SIZE);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {items.slice(0, count).map((m, i) => {
          const c = courses.get(m.courseId);
          return (
            <article key={m.id} className={`card flex flex-col hover:border-accent ${i >= PAGE_SIZE ? "animate-row-in" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="eyebrow">{c?.code ?? m.courseId}{c ? ` · ${c.name}` : ""}</span>
                <span className={materialType(m) === "paper" ? "badge-accent shrink-0" : "badge shrink-0"}>{MATERIAL_TYPES[materialType(m)]}</span>
              </div>
              <Link href={`/materials/${m.id}`} className="mt-1 font-semibold hover:underline">{m.title}</Link>
              <p className="mt-1 line-clamp-3 flex-1 text-sm text-ink-soft">{preview(m.text)}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <Link href={`/users/${m.uploaderId}`} className="hover:text-ink hover:underline">{m.uploaderName}</Link>
                <span>· {timeAgo(m.createdAt)}</span>
                {quizReady.has(m.id) && <span className="badge-accent ml-auto">Kuis siap duel</span>}
              </div>
            </article>
          );
        })}
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

/** A plain-text teaser of Markdown + LaTeX: drops headings, emphasis, links, code and math markers. */
function preview(text: string) {
  return plainTex(
    text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]/g, " [rumus] ")
      .replace(/\$([^$\n]+)\$|\\\((.+?)\\\)/g, (_, a: string | undefined, b: string | undefined) => a ?? b ?? "")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^[#>\-*+\s|]+/gm, ""),
  )
    .replace(/[*_`|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

/** Common LaTeX symbols, shown as the character itself in snippets. */
const TEX_SYMBOLS: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ", epsilon: "ε", theta: "θ", lambda: "λ", mu: "μ",
  pi: "π", rho: "ρ", sigma: "σ", Sigma: "Σ", tau: "τ", phi: "φ", omega: "ω", Omega: "Ω",
  cdot: "·", times: "×", pm: "±", le: "≤", leq: "≤", ge: "≥", geq: "≥", neq: "≠", approx: "≈", infty: "∞", to: "→", rightarrow: "→", sqrt: "√",
};

/** Inline LaTeX as readable text, e.g. "10\,\mathrm{m/s}^2" → "10 m/s^2", "\frac{\Delta x}{\Delta t}" → "Δx/Δt". */
function plainTex(text: string) {
  const group = String.raw`\{((?:[^{}]|\{[^{}]*\})*)\}`; // {…}, with one level of nested braces
  return text
    .replace(/\\\\|\\[,;:!> ]|~/g, " ")
    .replace(/\\(?:mathrm|text|textbf|textit|mathbf|mathit|mathsf|operatorname|emph|vec|hat|bar|overline|underline|dot|ddot|tilde|boldsymbol|left|right)(?![a-zA-Z])\s*/g, "")
    .replace(new RegExp(String.raw`\\[dt]?frac\s*${group}\s*${group}`, "g"), "$1/$2")
    .replace(/\\(?:begin|end)\s*\{[^{}]*\}/g, " ")
    // Known symbols become the character; other commands before a {…} (\section{Bab}) keep only the argument.
    .replace(/\\([a-zA-Z]+)(?=(\{)?)/g, (_, cmd: string, arg?: string) => TEX_SYMBOLS[cmd] ?? (arg ? "" : cmd))
    .replace(/[{}]/g, "");
}
