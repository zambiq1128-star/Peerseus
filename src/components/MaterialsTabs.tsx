import Link from "next/link";

const TABS = [
  { href: "/explore", label: "Semua materi" },
  { href: "/materials", label: "Materiku" },
  { href: "/opportunities", label: "Peluang" },
] as const;

/** Switches between Jelajah (everyone's public materials), Materiku (my own uploads) and Peluang (scholarships, competitions, seminars). */
export default function MaterialsTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <nav aria-label="Bagian Jelajah" className="flex gap-1 border-b border-line">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={active === t.href ? "page" : undefined}
          className={active === t.href ? "tab-active" : "tab"}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
