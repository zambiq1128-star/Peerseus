import Link from "next/link";

const TABS = [
  { href: "/explore", label: "Semua materi" },
  { href: "/materials", label: "Materiku" },
] as const;

/** Switches between Jelajah (everyone's public materials) and Materiku (my own uploads). */
export default function MaterialsTabs({ active }: { active: "/explore" | "/materials" }) {
  return (
    <nav aria-label="Jelajah atau Materiku" className="flex gap-1 border-b border-line">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={active === t.href ? "page" : undefined}
          className={active === t.href ? "tab-active" : "tab"}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
