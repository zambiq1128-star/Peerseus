"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { joinCourse } from "@/lib/peerseus";
import type { Course } from "@/lib/types";
import { PageTitle, Spinner, useAsync } from "@/components/ui";

export default function Courses() {
  const { profile, refresh } = useAuth();
  const { data } = useAsync(() => db.list<Course>("courses"), []);
  const [busy, setBusy] = useState("");
  if (!data) return <Spinner />;
  return (
    <div>
      <PageTitle title="Mata Kuliah" sub="Gabung mata kuliah untuk akses materi, duel, dan leaderboard." />
      <div className="grid gap-4 sm:grid-cols-2">
        {data.sort((a, b) => a.code.localeCompare(b.code)).map((c) => {
          const joined = profile!.courseIds.includes(c.id);
          return (
            <div key={c.id} className="card flex flex-col">
              <div className="text-xs font-bold text-sea">{c.code}</div>
              <div className="text-lg font-bold">{c.name}</div>
              <p className="mt-1 flex-1 text-sm text-muted">{c.description}</p>
              <div className="mt-4">
                {joined ? (
                  <Link href={`/courses/${c.id}`} className="btn-primary">Buka</Link>
                ) : (
                  <button
                    className="btn-gold"
                    disabled={busy === c.id}
                    onClick={async () => { setBusy(c.id); await joinCourse(profile!, c.id); await refresh(); setBusy(""); }}
                  >
                    {busy === c.id ? "Bergabung…" : "Gabung"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
