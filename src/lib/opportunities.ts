"use client";
import { db, newId } from "./db";
import type { Opportunity, OpportunityType, UserProfile } from "./types";

export const OPP_TYPES: Record<OpportunityType, string> = { beasiswa: "Beasiswa", lomba: "Lomba", seminar: "Seminar", lainnya: "Lainnya" };

/** Text limits. Keep in sync with the `opportunities` block in firestore.rules. */
export const OPP_LIMITS = { title: 150, organizer: 150, link: 500, description: 5000 } as const;

/** A peluang is "mendekati" (urgent) when it has this many days or fewer left. */
export const URGENT_DAYS = 7;

/** Calendar days from today (local) to the deadline (YYYY-MM-DD). 0 = today, negative = past. */
export function daysLeft(deadline: string, now = new Date()): number {
  const [y, m, d] = deadline.split("-").map(Number);
  const a = Date.UTC(y, m - 1, d);
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86400000);
}

/** "12 Desember 2026" */
export function formatDeadline(deadline: string): string {
  const [y, m, d] = deadline.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

/** Today as YYYY-MM-DD in local time (the date picker's `min`). */
export function todayString(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Label for the deadline badge; urgent ones read "Tinggal N hari". */
export function deadlineLabel(days: number): string {
  if (days < 0) return "Sudah lewat";
  if (days === 0) return "Hari ini";
  if (days <= URGENT_DAYS) return `Tinggal ${days} hari`;
  return `${days} hari lagi`;
}

export const isUrgent = (days: number) => days >= 0 && days <= URGENT_DAYS;

/** Empty `majors` means every faculty. */
export const forFaculty = (o: Pick<Opportunity, "majors">, major: string) => o.majors.length === 0 || o.majors.includes(major);

/** Only https:// links are accepted (same rule as firestore.rules). */
export function isHttpsLink(s: string): boolean {
  if (!/^https:\/\/[^\s]+$/.test(s)) return false;
  try {
    return new URL(s).protocol === "https:";
  } catch {
    return false;
  }
}

export const byDeadline = (a: Opportunity, b: Opportunity) => a.deadline.localeCompare(b.deadline) || a.createdAt - b.createdAt;

/** Not yet past, nearest deadline first. */
export function upcoming(list: Opportunity[], now = new Date()): Opportunity[] {
  return list.filter((o) => daysLeft(o.deadline, now) >= 0).sort(byDeadline);
}

/** Already past, most recently ended first. */
export function expired(list: Opportunity[], now = new Date()): Opportunity[] {
  return list.filter((o) => daysLeft(o.deadline, now) < 0).sort((a, b) => b.deadline.localeCompare(a.deadline));
}

export const listOpportunities = () => db.list<Opportunity>("opportunities");

/** The few nearest deadlines for the home page: for my faculty or every faculty. */
export async function nearestOpportunities(major: string, n = 3): Promise<Opportunity[]> {
  return upcoming((await listOpportunities()).filter((o) => forFaculty(o, major))).slice(0, n);
}

export type OpportunityInput = Pick<Opportunity, "title" | "type" | "organizer" | "deadline" | "majors" | "link" | "description">;

export async function createOpportunity(input: OpportunityInput, uid: string): Promise<Opportunity> {
  const o: Opportunity = { ...input, id: newId("opp_"), postedBy: uid, createdAt: Date.now(), reports: 0 };
  await db.set("opportunities", o.id, o);
  return o;
}

export async function updateOpportunity(id: string, input: OpportunityInput) {
  await db.update("opportunities", id, { ...input, updatedAt: Date.now() });
}

/** Name of whoever shared it; the seed samples have no poster. */
export async function posterName(o: Pick<Opportunity, "postedBy">): Promise<string | null> {
  if (o.postedBy === "seed") return null;
  return (await db.get<UserProfile>("users", o.postedBy).catch(() => null))?.name ?? null;
}
