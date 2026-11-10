"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Course } from "@/lib/types";
import { Empty, PageTitle, Spinner, useAsync } from "@/components/ui";
import PartnerList from "@/components/PartnerList";

export default function Partners() {
  const { profile } = useAuth();
  const { data } = useAsync(async () => (await Promise.all(profile!.courseIds.map((id) => db.get<Course>("courses", id)))).filter(Boolean) as Course[], [profile!.courseIds.join()]);
  const [sel, setSel] = useState("");
  if (!data) return <Spinner />;
  if (!data.length) return <Empty>Gabung <Link className="font-semibold text-sea" href="/courses">mata kuliah</Link> dulu untuk menemukan teman belajar.</Empty>;
  const courseId = sel || data[0].id;
  return (
    <div>
      <PageTitle title="Teman Belajar" sub="Rekomendasi berdasarkan topik yang kamu lewatkan saat duel dan level yang mirip." />
      <div className="mb-4 flex flex-wrap gap-2">
        {data.map((c) => (
          <button key={c.id} onClick={() => setSel(c.id)} className={courseId === c.id ? "btn-primary" : "btn-ghost"}>{c.code}</button>
        ))}
      </div>
      <PartnerList courseId={courseId} />
    </div>
  );
}
