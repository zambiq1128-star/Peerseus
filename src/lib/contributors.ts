"use client";
import { db } from "./db";
import type { Discussion, DiscussionAnswer, DiscussionVote, Material, Quiz, UserProfile } from "./types";

// ---------- Peringkat Kontributor per mata kuliah ----------
// Points per person for what they gave one course in the last 30 days. Nothing is stored: every number is
// computed from data that is already public, through db.ts (so demo mode on localStorage works the same).
// Opportunity discussions (opportunityId) and private materials never count.

export const WINDOW_DAYS = 30;
const DAY = 86400000;

/** Points per kind of contribution. */
export const POINTS = { bestAnswer: 5, proposal: 3, material: 3, upvote: 1 } as const;

export type Contributor = {
  uid: string;
  /** Current name from users/{id}. */
  name: string;
  isBot?: boolean;
  points: number;
  bestAnswers: number;
  proposals: number;
  materials: number;
  upvotes: number;
};

/** "2 jawaban terbaik · 1 materi · 4 upvote": only the kinds this person has. */
export function contributionSummary(c: Pick<Contributor, "bestAnswers" | "proposals" | "materials" | "upvotes">) {
  return [
    c.bestAnswers && `${c.bestAnswers} jawaban terbaik`,
    c.proposals && `${c.proposals} soal usulan`,
    c.materials && `${c.materials} materi`,
    c.upvotes && `${c.upvotes} upvote`,
  ].filter(Boolean).join(" · ");
}

type Tally = Record<"bestAnswers" | "proposals" | "materials" | "upvotes", number>;

/**
 * Ranking of one course, most points first (ties: more best answers, then name). People whose user document
 * is gone (deleted account) are left out, like the duel leaderboard (courseMembers).
 * Reads: public materials, quizzes, discussions of the course; answers and votes of each public material
 * (db.ts only filters with ==, so that is one query per material; they copy materialId).
 */
export async function courseContributors(courseId: string, now = Date.now()): Promise<Contributor[]> {
  const since = now - WINDOW_DAYS * DAY;
  const [materials, quizzes, discussions] = await Promise.all([
    db.list<Material>("materials", [["courseId", "==", courseId]]),
    db.list<Quiz>("quizzes", [["courseId", "==", courseId]]),
    db.list<Discussion>("discussions", [["courseId", "==", courseId]]),
  ]);
  const perMaterial = await Promise.all(materials.map(async (m) => {
    const where: [string, "==", string][] = [["materialId", "==", m.id]];
    const [answers, votes] = await Promise.all([db.list<DiscussionAnswer>("discussionAnswers", where), db.list<DiscussionVote>("discussionVotes", where)]);
    return { answers, votes };
  }));
  const answers = perMaterial.flatMap((x) => x.answers);
  const votes = perMaterial.flatMap((x) => x.votes);

  const tally = new Map<string, Tally>();
  const add = (uid: string | undefined, kind: keyof Tally) => {
    if (!uid) return;
    const t = tally.get(uid) ?? { bestAnswers: 0, proposals: 0, materials: 0, upvotes: 0 };
    t[kind]++;
    tally.set(uid, t);
  };

  for (const m of materials) if (m.createdAt >= since) add(m.uploaderId, "materials");

  // Accepted proposals live on the public quiz (Question.proposedBy); old ones have no acceptedAt and still count.
  for (const q of quizzes) for (const x of q.questions) if (x.proposedBy && (x.proposedBy.acceptedAt ?? now) >= since) add(x.proposedBy.id, "proposals");

  const byId = new Map(answers.map((a) => [a.id, a]));
  for (const d of discussions) {
    const best = d.bestAnswerId ? byId.get(d.bestAnswerId) : undefined;
    if (best && best.discussionId === d.id && best.createdAt >= since) add(best.authorId, "bestAnswers");
  }
  for (const v of votes) {
    const a = v.targetType === "answer" ? byId.get(v.targetId) : undefined;
    if (a && v.createdAt >= since) add(a.authorId, "upvotes");
  }

  const ids = [...tally.keys()];
  const users = await Promise.all(ids.map((id) => db.get<UserProfile>("users", id).catch(() => null)));
  const rows = ids.flatMap((uid, i) => {
    const u = users[i];
    if (!u) return [];
    const t = tally.get(uid)!;
    const points = t.bestAnswers * POINTS.bestAnswer + t.proposals * POINTS.proposal + t.materials * POINTS.material + t.upvotes * POINTS.upvote;
    return [{ uid, name: u.name, isBot: u.isBot, points, ...t }];
  });
  return rows.sort((a, b) => b.points - a.points || b.bestAnswers - a.bestAnswers || a.name.localeCompare(b.name));
}
