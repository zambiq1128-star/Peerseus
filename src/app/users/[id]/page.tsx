"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { academicLabel, entryYearLabel } from "@/lib/itb";
import { MATERIAL_TYPES, materialType } from "@/lib/peerseus";
import type { Course, Material, Membership, UserProfile } from "@/lib/types";
import { AccountBadge, CollapsibleRows, Empty, ErrorState, NotFound, Page, PageHeader, Section, Spinner, timeAgo, useAsync } from "@/components/ui";

/**
 * Someone's profile as other people see it. Reads only users/{id} (never the private part), so fields the
 * owner hid are simply missing, also for the owner.
 */
export default function UserPage() {
  const { id } = useParams<{ id: string }>();
  const { profile: me } = useAuth();
  const { data, error, reload } = useAsync(async () => {
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

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  const { user } = data;
  if (!user) return <NotFound title="Pengguna tidak ditemukan" />;
  const isMe = me?.id === user.id;

  return (
    <Page width="narrow">
      <div>
        <PageHeader
          back={{ label: "Kembali" }}
          title={<>
            {user.name}
            {user.isBot && <span className="badge ml-2 align-middle">demo</span>}
            <AccountBadge itb={user.isItbVerified} className="ml-2 align-middle" />
          </>}
          sub={[academicLabel(user), entryYearLabel(user), user.semester ? `semester ${user.semester}` : ""].filter(Boolean).join(" · ")}
        />
        {user.bio && <p className="mt-3 text-sm">{user.bio}</p>}
        {user.contact && <p className="mt-2 text-sm text-muted">Kontak: <span className="text-ink">{user.contact}</span></p>}
      </div>

      {isMe && (
        <div className="card flex flex-wrap items-center justify-between gap-3 !bg-paper text-sm">
          <span>Ini profilmu seperti dilihat orang lain.</span>
          <Link href="/profile" className="btn-ghost">Atur profil</Link>
        </div>
      )}

      <Section title="Mata kuliah">
        {data.memberships.length === 0 ? <Empty>Belum ikut mata kuliah.</Empty> : (
          <CollapsibleRows items={data.memberships}>
            {(m) => {
              const c = data.courses.get(m.courseId);
              return (
                <Link key={m.id} href={`/courses/${m.courseId}`} className="flex items-center justify-between gap-3 p-3 hover:bg-paper">
                  <span className="text-sm"><span className="font-medium">{c?.code ?? m.courseId}</span> · {c?.name ?? ""}</span>
                  <span className="text-sm"><span className="text-xs text-muted">rating </span><b>{m.elo}</b></span>
                </Link>
              );
            }}
          </CollapsibleRows>
        )}
      </Section>

      <Section title="Materi yang dibagikan">
        {data.materials.length === 0 ? <Empty>Belum ada materi.</Empty> : (
          <CollapsibleRows items={data.materials}>
            {(m) => (
              <Link key={m.id} href={`/materials/${m.id}`} className="block p-3 hover:bg-paper">
                <div className="text-sm font-medium">{m.title}</div>
                <div className="text-xs text-muted">{MATERIAL_TYPES[materialType(m)]} · {data.courses.get(m.courseId)?.code ?? m.courseId} · {timeAgo(m.createdAt)}</div>
              </Link>
            )}
          </CollapsibleRows>
        )}
      </Section>
    </Page>
  );
}
