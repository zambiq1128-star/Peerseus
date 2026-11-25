"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { academicLabel, entryYearLabel } from "@/lib/itb";
import { MATERIAL_TYPES, materialType } from "@/lib/peerseus";
import type { Course, Material, Membership, UserProfile } from "@/lib/types";
import { Empty, Spinner, timeAgo, useAsync } from "@/components/ui";

/**
 * Someone's profile as other people see it. Reads only users/{id} (never the private part), so fields the
 * owner hid are simply missing, also for the owner.
 */
export default function UserPage() {
  const { id } = useParams<{ id: string }>();
  const { profile: me } = useAuth();
  const { data } = useAsync(async () => {
    const [user, memberships, materials, courses] = await Promise.all([
      db.get<UserProfile>("users", id),
      db.list<Membership>("memberships", [["uid", "==", id]]),
      db.list<Material>("materials", [["uploaderId", "==", id]]),
      db.list<Course>("courses"),
    ]);
    return {
      user,
      memberships: memberships.filter((m) => !m.left).sort((a, b) => b.elo - a.elo),
      materials: materials.sort((a, b) => b.createdAt - a.createdAt),
      courses: new Map(courses.map((c) => [c.id, c])),
    };
  }, [id]);

  if (!data) return <Spinner />;
  const { user } = data;
  if (!user) return <Empty>Pengguna tidak ditemukan.</Empty>;
  const isMe = me?.id === user.id;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {isMe && (
        <div className="card flex flex-wrap items-center justify-between gap-3 bg-paper text-sm">
          <span>Ini profilmu seperti dilihat orang lain.</span>
          <Link href="/profile" className="btn-ghost">Atur profil</Link>
        </div>
      )}

      <div>
        <h1 className="text-xl font-bold">
          {user.name}
          {user.isBot && <span className="badge ml-2 align-middle">demo</span>}
          {user.isItbVerified === false && <span className="badge ml-2 align-middle">Tamu</span>}
        </h1>
        <p className="text-sm text-muted">{[academicLabel(user), entryYearLabel(user), user.semester ? `semester ${user.semester}` : ""].filter(Boolean).join(" · ")}</p>
        {user.bio && <p className="mt-3 text-sm">{user.bio}</p>}
        {user.contact && <p className="mt-2 text-sm text-muted">Kontak: <span className="text-ink">{user.contact}</span></p>}
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">Mata kuliah</h2>
        {data.memberships.length === 0 ? <Empty>Belum ikut mata kuliah.</Empty> : (
          <div className="divide-y divide-line rounded-xl border border-line">
            {data.memberships.map((m) => {
              const c = data.courses.get(m.courseId);
              return (
                <Link key={m.id} href={`/courses/${m.courseId}`} className="flex items-center justify-between gap-3 p-3 hover:bg-paper">
                  <span className="text-sm"><span className="font-medium">{c?.code ?? m.courseId}</span> · {c?.name ?? ""}</span>
                  <span className="text-sm"><span className="text-xs text-muted">rating </span><b>{m.elo}</b></span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">Materi yang dibagikan</h2>
        {data.materials.length === 0 ? <Empty>Belum ada materi.</Empty> : (
          <div className="divide-y divide-line rounded-xl border border-line">
            {data.materials.map((m) => (
              <Link key={m.id} href={`/materials/${m.id}`} className="block p-3 hover:bg-paper">
                <div className="text-sm font-medium">{m.title}</div>
                <div className="text-xs text-muted">{MATERIAL_TYPES[materialType(m)]} · {data.courses.get(m.courseId)?.code ?? m.courseId} · {timeAgo(m.createdAt)}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
